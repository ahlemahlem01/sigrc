using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>An administrator sets a deadline of their own on an open claim: any future date, with a reason, and always traced.</summary>
public class DeadlineChangeTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public DeadlineChangeTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private static string Day(int fromToday) => DateTime.UtcNow.Date.AddDays(fromToday).ToString("yyyy-MM-dd");
    private const string Reason = "Client prioritaire : livraison avancée de deux semaines.";

    private async Task<Guid> SeedClaimAsync(int? deadlineFromToday, string status = "OUVERTE")
    {
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = id, Title = "date personnalisée", DefectType = "Soudure", ClientId = "A", Severity = "LOW", LotNumber = "L", Description = "d",
                StatusCode = status, DetectionDate = DateTime.UtcNow, CreatedById = TestAuthHandler.TestUserId.ToString(),
                Deadline = deadlineFromToday.HasValue ? DateTime.UtcNow.Date.AddDays(deadlineFromToday.Value) : null,
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
    public async Task ADeadline_CanBeSetWhereThereWasNone_AndTheEventSaysWhy()
    {
        var id = await SeedClaimAsync(null);
        var r = await As("admin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-change", new { newDeadline = Day(10), reason = Reason });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(DateTime.UtcNow.Date.AddDays(10), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        var ev = Query(db => db.ClaimEvents.Single(e => e.ClaimId == id && e.ActionType == "claim_deadline_changed"));
        Assert.Contains("— →", ev.Detail);
        Assert.Contains(Day(10), ev.Detail);
        Assert.Contains("Client prioritaire", ev.Detail);
    }

    [Fact]
    public async Task ADeadline_CanMoveEarlier_AndTheEventKeepsTheOldDate()
    {
        var id = await SeedClaimAsync(20);
        var r = await As("admin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-change", new { newDeadline = Day(6), reason = Reason });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(DateTime.UtcNow.Date.AddDays(6), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        var ev = Query(db => db.ClaimEvents.Single(e => e.ClaimId == id && e.ActionType == "claim_deadline_changed"));
        Assert.Contains(Day(20), ev.Detail);
        Assert.Contains(Day(6), ev.Detail);
    }

    [Fact]
    public async Task OnlyAdministrators_CanChange()
    {
        var id = await SeedClaimAsync(5);
        Assert.Equal(HttpStatusCode.Forbidden, (await As("user").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-change", new { newDeadline = Day(9), reason = Reason })).StatusCode);
        Assert.Equal(DateTime.UtcNow.Date.AddDays(5), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
    }

    [Theory]
    [InlineData("reasonRequired", "court", 9)]
    [InlineData("newDateInPast", Reason, -2)]
    [InlineData("tooFar", Reason, 400)]
    [InlineData("sameDate", Reason, 5)]
    public async Task ARefusedChange_ChangesNothing_AndSaysWhy(string code, string reason, int newFromToday)
    {
        var id = await SeedClaimAsync(5);
        var r = await As("superadmin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-change", new { newDeadline = Day(newFromToday), reason });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal(code, await CodeOf(r));
        Assert.Equal(DateTime.UtcNow.Date.AddDays(5), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        Assert.Empty(Query(db => db.ClaimEvents.Where(e => e.ClaimId == id && e.ActionType == "claim_deadline_changed").ToList()));
    }

    [Fact]
    public async Task AClosedClaim_IsNotChanged()
    {
        var id = await SeedClaimAsync(5, "CLOTUREE");
        var r = await As("superadmin").PostAsJsonAsync($"/api/QualityAnalysis/claims/{id}/deadline-change", new { newDeadline = Day(9), reason = Reason });
        Assert.Equal("notOpen", await CodeOf(r));
    }
}
