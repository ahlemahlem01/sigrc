using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>An administrator gives a late claim or CAPA plan more time: only late, only forward, with a reason, and always traced.</summary>
public class DeadlineExtensionTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public DeadlineExtensionTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private static string Day(int fromToday) => DateTime.UtcNow.Date.AddDays(fromToday).ToString("yyyy-MM-dd");
    private const string Reason = "Lot bloqué chez le fournisseur, retour attendu la semaine prochaine.";

    private async Task<Guid> SeedClaimAsync(int deadlineFromToday, string status = "OUVERTE", string? assignedTo = null)
    {
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = id, Title = "prolongation", DefectType = "Soudure", ClientId = "A", Severity = "LOW", LotNumber = "L", Description = "d",
                StatusCode = status, DetectionDate = DateTime.UtcNow, Deadline = DateTime.UtcNow.Date.AddDays(deadlineFromToday), CreatedById = TestAuthHandler.TestUserId.ToString(), AssignedToId = assignedTo,
            });
            return Task.CompletedTask;
        });
        return id;
    }

    private async Task<Guid> SeedPlanAsync(int deadlineFromToday, ActionPlanStatus status = ActionPlanStatus.Ongoing, string? assignedTo = null)
    {
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = id, Title = "plan en retard", OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x", AssignedToId = assignedTo,
                Type = ActionPlanType.PAC, Status = status, Deadline = DateTime.UtcNow.Date.AddDays(deadlineFromToday),
            });
            return Task.CompletedTask;
        });
        return id;
    }

    private T Query<T>(Func<ActionPlanDbContext, T> read)
    {
        using var scope = _factory.Services.CreateScope();
        return read(scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>());
    }

    private static async Task<string?> CodeOf(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("code", out var c) ? c.GetString() : null;

    [Fact]
    public async Task ALateClaim_GetsMoreTime_AndTheEventKeepsOldDateNewDateAndReason()
    {
        var id = await SeedClaimAsync(-10);
        var response = await As("admin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-extension", new { newDeadline = Day(7), reason = Reason });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        Assert.Equal(DateTime.UtcNow.Date.AddDays(7), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        var ev = Query(db => db.ClaimEvents.Single(e => e.ClaimId == id && e.ActionType == "claim_deadline_extended"));
        Assert.Contains(Day(-10), ev.Detail);
        Assert.Contains(Day(7), ev.Detail);
        Assert.Contains("+17 d", ev.Detail);
        Assert.Contains("Lot bloqué", ev.Detail);
    }

    [Fact]
    public async Task OnlyAdministrators_CanExtend()
    {
        var id = await SeedClaimAsync(-3);
        var response = await As("user").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-extension", new { newDeadline = Day(5), reason = Reason });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(DateTime.UtcNow.Date.AddDays(-3), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
    }

    [Theory]
    [InlineData("reasonRequired", "court", 5, -3)]               // reason too short
    [InlineData("notLate", Reason, 20, 4)]                        // not late yet
    [InlineData("newDateInPast", Reason, -1, -10)]                // still in the past
    [InlineData("notAfterCurrent", Reason, 0, 0)]                 // placeholder, replaced below
    [InlineData("tooFar", Reason, 400, -3)]                       // more than 180 days ahead
    public async Task ARefusedExtension_ChangesNothing_AndSaysWhy(string code, string reason, int newFromToday, int deadlineFromToday)
    {
        if (code == "notAfterCurrent") { deadlineFromToday = -2; newFromToday = -5; }   // a date before the current one
        var id = await SeedClaimAsync(deadlineFromToday);
        var response = await As("superadmin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-extension", new { newDeadline = Day(newFromToday), reason });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var got = await CodeOf(response);
        Assert.True(got == code || (code == "notAfterCurrent" && got == "newDateInPast"), $"expected {code}, got {got}");
        Assert.Equal(DateTime.UtcNow.Date.AddDays(deadlineFromToday), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        Assert.Empty(Query(db => db.ClaimEvents.Where(e => e.ClaimId == id && e.ActionType == "claim_deadline_extended").ToList()));
    }

    [Fact]
    public async Task AClosedClaim_IsNotExtended()
    {
        var id = await SeedClaimAsync(-5, "CLOTUREE");
        var response = await As("superadmin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-extension", new { newDeadline = Day(5), reason = Reason });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("notOpen", await CodeOf(response));
    }

    [Fact]
    public async Task ALateCapaPlan_GetsMoreTime_AndItsHistoryKeepsTheTrace()
    {
        var id = await SeedPlanAsync(-8);
        var response = await As("superadmin").PostAsJsonAsync($"/api/ActionPlan/{id}/deadline-extension", new { newDeadline = Day(10), reason = Reason });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        Assert.Equal(DateTime.UtcNow.Date.AddDays(10), Query(db => db.ActionPlans.Single(p => p.Id == id).Deadline));
        var h = Query(db => db.ActionPlanHistories.Single(x => x.ActionPlanId == id && x.ActionType == "deadline_extended"));
        Assert.Contains("+18 d", h.Note);
        Assert.Contains("Lot bloqué", h.Note);
        Assert.Contains(DateTime.UtcNow.Date.AddDays(-8).ToString("dd/MM/yyyy"), h.ChangesJson);
    }

    [Fact]
    public async Task ACapaPlan_FollowsTheSameRules()
    {
        var notLate = await SeedPlanAsync(3);
        Assert.Equal("notLate", await CodeOf(await As("superadmin").PostAsJsonAsync($"/api/ActionPlan/{notLate}/deadline-extension", new { newDeadline = Day(9), reason = Reason })));

        var closed = await SeedPlanAsync(-4, ActionPlanStatus.Closed);
        Assert.Equal("notOpen", await CodeOf(await As("superadmin").PostAsJsonAsync($"/api/ActionPlan/{closed}/deadline-extension", new { newDeadline = Day(9), reason = Reason })));

        var late = await SeedPlanAsync(-4);
        Assert.Equal(HttpStatusCode.Forbidden, (await As("user").PostAsJsonAsync($"/api/ActionPlan/{late}/deadline-extension", new { newDeadline = Day(9), reason = Reason })).StatusCode);
        Assert.Equal("reasonRequired", await CodeOf(await As("superadmin").PostAsJsonAsync($"/api/ActionPlan/{late}/deadline-extension", new { newDeadline = Day(9), reason = "  " })));
        Assert.Empty(Query(db => db.ActionPlanHistories.Where(x => x.ActionPlanId == late && x.ActionType == "deadline_extended").ToList()));
    }

    [Fact]
    public async Task TheAssignee_IsNotified_WithTheNewDateTheOldDateAndTheReason()
    {
        var employee = Guid.NewGuid().ToString();
        var claim = await SeedClaimAsync(-6, assignedTo: employee);
        Assert.Equal(HttpStatusCode.OK, (await As("superadmin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{claim}/deadline-extension", new { newDeadline = Day(9), reason = Reason })).StatusCode);

        var plan = await SeedPlanAsync(-6, assignedTo: employee);
        Assert.Equal(HttpStatusCode.OK, (await As("superadmin").PostAsJsonAsync($"/api/ActionPlan/{plan}/deadline-extension", new { newDeadline = Day(9), reason = Reason })).StatusCode);

        _factory.Notifier.Verify(n => n.NotifyAsync(employee, "claim_deadline_extended", "Échéance prolongée",
            It.Is<string>(m => m.Contains(DateTime.UtcNow.Date.AddDays(9).ToString("dd/MM/yyyy")) && m.Contains(DateTime.UtcNow.Date.AddDays(-6).ToString("dd/MM/yyyy")) && m.Contains("Lot bloqué")),
            null, It.Is<string?>(l => l != null && l.Contains(claim.ToString())), claim), Times.Once);
        _factory.Notifier.Verify(n => n.NotifyAsync(employee, "plan_deadline_extended", "Échéance prolongée", It.IsAny<string>(), plan, null, null), Times.Once);
    }

    [Fact]
    public async Task TheAdministratorWhoActs_IsNotNotified_AndARefusedExtensionNotifiesNobody()
    {
        var self = TestAuthHandler.TestUserId.ToString();
        var mine = await SeedClaimAsync(-6, assignedTo: self);
        await As("superadmin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{mine}/deadline-extension", new { newDeadline = Day(9), reason = Reason });
        _factory.Notifier.Verify(n => n.NotifyAsync(self, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<string?>(), It.IsAny<Guid?>()), Times.Never);

        var employee = Guid.NewGuid().ToString();
        var refused = await SeedClaimAsync(-6, assignedTo: employee);
        await As("superadmin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{refused}/deadline-extension", new { newDeadline = Day(9), reason = "court" });
        _factory.Notifier.Verify(n => n.NotifyAsync(employee, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<string?>(), It.IsAny<Guid?>()), Times.Never);
    }
}
