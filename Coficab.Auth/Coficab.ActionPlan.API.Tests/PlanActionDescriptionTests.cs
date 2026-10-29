using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The description of a sub-action can be rewritten; the old and the new text stay in its history.</summary>
public class PlanActionDescriptionTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private const string AdminId = "33333333-3333-3333-3333-333333333333";
    private const string Stranger = "44444444-4444-4444-4444-444444444444";

    private readonly ActionPlanApiFactory _factory;
    public PlanActionDescriptionTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role, string? userId = null)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (userId != null) client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, userId);
        return client;
    }

    private async Task<(Guid plan, Guid action)> SeedAsync(ActionProgress progress = ActionProgress.Fifty)
    {
        var planId = Guid.NewGuid();
        var actionId = Guid.NewGuid();
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = planId, Title = "CAPA", Status = ActionPlanStatus.Ongoing, Type = ActionPlanType.PAC, OwnerId = AdminId, AssignedToId = Me,
                OrganizationId = org, DepartmentId = dept, CreatedAt = DateTime.UtcNow,
            });
            db.UserActionPlanAssignments.Add(new UserActionPlanAssignment
            {
                Id = Guid.NewGuid(), UserId = Me, ActionPlanId = planId, CanView = true, CanEdit = true, CreatedAt = DateTime.UtcNow,
            });
            db.PlanActions.Add(new PlanAction
            {
                Id = actionId, ActionPlanId = planId, Title = "Corriger le gabarit", Description = "Texte initial", Progress = progress, AssignedToId = Me,
            });
            return Task.CompletedTask;
        });
        return (planId, actionId);
    }

    private static Task<HttpResponseMessage> Patch(HttpClient client, Guid action, string? description) =>
        client.PatchAsJsonAsync($"/api/planaction/{action}/description", new { description });

    [Fact]
    public async Task Rewriting_TheDescription_KeepsBothTexts_InTheActionHistory()
    {
        var (_, action) = await SeedAsync();
        var client = ClientAs("user");

        var response = await Patch(client, action, "  Remplacer le guide n° 3 de EXT-01  ");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var history = JsonDocument.Parse(await client.GetStringAsync($"/api/planaction/{action}/history"));
        var row = history.RootElement.EnumerateArray().Single(r => r.GetProperty("newDescription").ValueKind == JsonValueKind.String);
        Assert.Equal("Texte initial", row.GetProperty("oldDescription").GetString());
        Assert.Equal("Remplacer le guide n° 3 de EXT-01", row.GetProperty("newDescription").GetString());
        Assert.Equal(50, row.GetProperty("oldProgress").GetInt32());   // the progress did not move
        Assert.Equal(50, row.GetProperty("newProgress").GetInt32());

        using var current = JsonDocument.Parse(await client.GetStringAsync($"/api/planaction/{action}"));
        Assert.Equal("Remplacer le guide n° 3 de EXT-01", current.RootElement.GetProperty("description").GetString());
    }

    [Fact]
    public async Task EachRewrite_AddsARow_NothingIsOverwritten()
    {
        var (_, action) = await SeedAsync();
        var client = ClientAs("user");
        Assert.Equal(HttpStatusCode.OK, (await Patch(client, action, "Première version")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Patch(client, action, "Deuxième version")).StatusCode);

        using var history = JsonDocument.Parse(await client.GetStringAsync($"/api/planaction/{action}/history"));
        var rows = history.RootElement.EnumerateArray().Where(r => r.GetProperty("newDescription").ValueKind == JsonValueKind.String).ToList();
        Assert.Equal(2, rows.Count);
        Assert.Contains(rows, r => r.GetProperty("oldDescription").GetString() == "Première version" && r.GetProperty("newDescription").GetString() == "Deuxième version");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    [InlineData("Texte initial")]
    public async Task EmptyOrUnchangedDescription_IsRefused(string? text)
    {
        var (_, action) = await SeedAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await Patch(ClientAs("user"), action, text)).StatusCode);
    }

    [Fact]
    public async Task AValidatedSubAction_CannotBeRewritten()
    {
        var (_, action) = await SeedAsync(ActionProgress.Validated);
        Assert.Equal(HttpStatusCode.BadRequest, (await Patch(ClientAs("user"), action, "Autre texte")).StatusCode);
    }

    [Fact]
    public async Task SomeoneNotInChargeOfThePlan_IsRefused()
    {
        var (_, action) = await SeedAsync();
        var response = await Patch(ClientAs("user", Stranger), action, "Autre texte");
        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound, response.StatusCode.ToString());
    }

    [Fact]
    public async Task AnAdministrator_CanRewrite_AndTheDescriptionAppearsInThePlanHistory()
    {
        var (plan, action) = await SeedAsync();

        Assert.Equal(HttpStatusCode.OK, (await Patch(ClientAs("admin", AdminId), action, "Texte de l'admin")).StatusCode);

        var timeline = await ClientAs("user").GetStringAsync($"/api/ActionPlan/assigned/{plan}/history");
        Assert.Contains("subaction_description", timeline);
    }
}
