using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>An administrator gives a late, unfinished sub-action more time; the history keeps the old date, the new one and the reason.</summary>
public class ActionDeadlineExtensionTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private const string AdminId = "33333333-3333-3333-3333-333333333333";
    private readonly ActionPlanApiFactory _factory;
    public ActionDeadlineExtensionTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (role != "user") client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, AdminId);
        return client;
    }

    private async Task<Guid> SeedAsync(int daysLate, ActionProgress progress = ActionProgress.Fifty)
    {
        var plan = Guid.NewGuid();
        var action = Guid.NewGuid();
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = plan, Title = "CAPA", Status = ActionPlanStatus.Ongoing, Type = ActionPlanType.PAC, OwnerId = AdminId, AssignedToId = Me,
                OrganizationId = org, DepartmentId = dept, CreatedAt = DateTime.UtcNow,
            });
            db.PlanActions.Add(new PlanAction
            {
                Id = action, ActionPlanId = plan, Title = "Remplacer le guide", Progress = progress, AssignedToId = Me,
                Deadline = DateTime.UtcNow.Date.AddDays(-daysLate),
            });
            return Task.CompletedTask;
        });
        return action;
    }

    private static string Date(int daysFromToday) => DateTime.UtcNow.Date.AddDays(daysFromToday).ToString("yyyy-MM-dd");

    private static Task<HttpResponseMessage> Extend(HttpClient c, Guid id, string? date, string? reason) =>
        c.PostAsJsonAsync($"/api/planaction/{id}/deadline-extension", new { newDeadline = date, reason });

    [Fact]
    public async Task ALateAction_GetsMoreTime_TheHistoryKeepsBothDatesAndTheReason_AndThePersonIsTold()
    {
        var action = await SeedAsync(daysLate: 6);
        _factory.Notifier.Invocations.Clear();

        var response = await Extend(ClientAs("admin"), action, Date(9), "Pièce commandée, livraison la semaine prochaine");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(15, body.RootElement.GetProperty("extraDays").GetInt32());

        using var history = JsonDocument.Parse(await ClientAs("admin").GetStringAsync($"/api/planaction/{action}/history"));
        var row = history.RootElement.EnumerateArray().Single(r => (r.GetProperty("note").GetString() ?? "").StartsWith("Échéance prolongée"));
        Assert.Contains("Pièce commandée", row.GetProperty("note").GetString());
        Assert.Equal(50, row.GetProperty("oldProgress").GetInt32());
        Assert.Equal(50, row.GetProperty("newProgress").GetInt32());

        using var current = JsonDocument.Parse(await ClientAs("admin").GetStringAsync($"/api/planaction/{action}"));
        Assert.StartsWith(Date(9), current.RootElement.GetProperty("deadline").GetString());

        _factory.Notifier.Verify(n => n.NotifyLocalizedAsync(Me, "action_deadline_extended", "Échéance prolongée",
            It.IsAny<string>(), It.Is<string>(d => d.Contains("\"days\":15")), It.IsAny<Guid?>(), null, null), Times.Once);
    }

    [Fact]
    public async Task TheRules_AreTheSameAsForClaimsAndPlans()
    {
        var late = await SeedAsync(daysLate: 6);
        var notLate = await SeedAsync(daysLate: -3);
        var finished = await SeedAsync(daysLate: 6, ActionProgress.Hundred);
        var admin = ClientAs("admin");

        Assert.Equal(HttpStatusCode.BadRequest, (await Extend(admin, late, Date(9), "court")).StatusCode);                   // reason too short
        Assert.Equal(HttpStatusCode.BadRequest, (await Extend(admin, late, Date(-8), "Motif suffisamment long")).StatusCode); // before the current date
        Assert.Equal(HttpStatusCode.BadRequest, (await Extend(admin, late, Date(400), "Motif suffisamment long")).StatusCode); // too far
        Assert.Equal(HttpStatusCode.BadRequest, (await Extend(admin, notLate, Date(20), "Motif suffisamment long")).StatusCode); // not late
        Assert.Equal(HttpStatusCode.BadRequest, (await Extend(admin, finished, Date(9), "Motif suffisamment long")).StatusCode); // finished
        Assert.Equal(HttpStatusCode.BadRequest, (await Extend(admin, late, null, "Motif suffisamment long")).StatusCode);        // no date
    }

    [Fact]
    public async Task OnlyAdministrators_CanExtend()
    {
        var action = await SeedAsync(daysLate: 6);
        Assert.Equal(HttpStatusCode.Forbidden, (await Extend(ClientAs("user"), action, Date(9), "Motif suffisamment long")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Extend(ClientAs("admin"), Guid.NewGuid(), Date(9), "Motif suffisamment long")).StatusCode);
    }
}
