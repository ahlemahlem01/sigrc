using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>An administrator gives a whole plan, or one sub-action, to another person; it is kept in the assignment history.</summary>
public class ReassignmentTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private const string AdminId = "33333333-3333-3333-3333-333333333333";
    private const string Newcomer = "55555555-5555-5555-5555-555555555555";

    private readonly ActionPlanApiFactory _factory;
    public ReassignmentTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (role != "user") client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, AdminId);
        return client;
    }

    /// <summary>A plan assigned to the test user with a running, a finished and a validated sub-action.</summary>
    private async Task<(Guid plan, Guid running, Guid finished, Guid validated)> SeedAsync()
    {
        var plan = Guid.NewGuid();
        var running = Guid.NewGuid();
        var finished = Guid.NewGuid();
        var validated = Guid.NewGuid();
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = plan, Title = "CAPA test", Status = ActionPlanStatus.Ongoing, Type = ActionPlanType.PAC, OwnerId = AdminId, AssignedToId = Me,
                OrganizationId = org, DepartmentId = dept, CreatedAt = DateTime.UtcNow,
            });
            db.UserActionPlanAssignments.Add(new UserActionPlanAssignment
            {
                Id = Guid.NewGuid(), UserId = Me, ActionPlanId = plan, CanView = true, CanEdit = true, CreatedAt = DateTime.UtcNow,
            });
            db.PlanActions.Add(new PlanAction { Id = running, ActionPlanId = plan, Title = "En cours", Progress = ActionProgress.Fifty, AssignedToId = Me });
            db.PlanActions.Add(new PlanAction { Id = finished, ActionPlanId = plan, Title = "Terminée", Progress = ActionProgress.Hundred, AssignedToId = Me });
            db.PlanActions.Add(new PlanAction { Id = validated, ActionPlanId = plan, Title = "Validée", Progress = ActionProgress.Validated, AssignedToId = Me });
            return Task.CompletedTask;
        });
        return (plan, running, finished, validated);
    }

    private static Task<HttpResponseMessage> Reassign(HttpClient client, string url, string? user, string? note = null) =>
        client.PostAsJsonAsync(url, new { userId = user, note });

    private async Task<List<JsonElement>> AssignmentHistory(Guid action) =>
        JsonDocument.Parse(await ClientAs("admin").GetStringAsync($"/api/planaction/{action}/assignment-history")).RootElement.EnumerateArray().ToList();

    [Fact]
    public async Task OneSubAction_IsGivenToAnotherPerson_AndTheHistoryRecordsWhoToWhom()
    {
        var (_, running, _, _) = await SeedAsync();

        var response = await Reassign(ClientAs("admin"), $"/api/planaction/{running}/reassign", Newcomer, "Mourad connaît la ligne");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var row = (await AssignmentHistory(running)).Single();
        Assert.Equal("reassigned", row.GetProperty("actionType").GetString());
        Assert.Equal(Me, row.GetProperty("oldAssignedToId").GetString());
        Assert.Equal(Newcomer, row.GetProperty("newAssignedToId").GetString());
        Assert.Equal(AdminId, row.GetProperty("changedBy").GetString());
        Assert.Equal("Mourad connaît la ligne", row.GetProperty("note").GetString());

        using var current = JsonDocument.Parse(await ClientAs("admin").GetStringAsync($"/api/planaction/{running}"));
        Assert.Equal(Newcomer, current.RootElement.GetProperty("assignedToId").GetString());
    }

    [Fact]
    public async Task ASubActionIsNotMoved_ToTheSamePerson_OrWhenValidated_OrBySomeoneWhoIsNotAdministrator()
    {
        var (_, running, _, validated) = await SeedAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await Reassign(ClientAs("admin"), $"/api/planaction/{running}/reassign", Me)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Reassign(ClientAs("admin"), $"/api/planaction/{validated}/reassign", Newcomer)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Reassign(ClientAs("admin"), $"/api/planaction/{running}/reassign", "")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Reassign(ClientAs("user"), $"/api/planaction/{running}/reassign", Newcomer)).StatusCode);
        Assert.Empty(await AssignmentHistory(running));
    }

    [Fact]
    public async Task TheWholePlan_MovesWithItsOpenSubActions_AndEachOneKeepsItsOwnHistory()
    {
        var (plan, running, finished, validated) = await SeedAsync();

        var response = await Reassign(ClientAs("admin"), $"/api/ActionPlan/{plan}/reassign", Newcomer, "Départ en congé");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, body.RootElement.GetProperty("movedActions").GetInt32());   // the validated one stays

        Assert.Single(await AssignmentHistory(running));
        Assert.Single(await AssignmentHistory(finished));
        Assert.Empty(await AssignmentHistory(validated));

        // the new person can open the plan, and it shows in the plan's history
        var asNewcomer = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        asNewcomer.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "user");
        asNewcomer.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, Newcomer);
        Assert.Equal(HttpStatusCode.OK, (await asNewcomer.GetAsync($"/api/ActionPlan/assigned/{plan}")).StatusCode);
    }

    [Fact]
    public async Task APlan_IsNotReassigned_WhenAlreadyTheirs_ClosedOrByAnEmployee()
    {
        var (plan, _, _, _) = await SeedAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await Reassign(ClientAs("user"), $"/api/ActionPlan/{plan}/reassign", Newcomer)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Reassign(ClientAs("admin"), $"/api/ActionPlan/{plan}/reassign", Newcomer)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Reassign(ClientAs("admin"), $"/api/ActionPlan/{plan}/reassign", Newcomer)).StatusCode);
    }
}
