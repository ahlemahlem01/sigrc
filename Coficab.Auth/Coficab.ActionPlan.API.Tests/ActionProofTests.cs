using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>An action is only finished (100 %) with a proof attached.</summary>
public class ActionProofTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ActionProofTests(ActionPlanApiFactory factory) => _factory = factory;

    private async Task<Guid> SeedActionAsync(bool withProof)
    {
        var actionId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            var org = Guid.NewGuid();
            var dept = Guid.NewGuid();
            var planId = Guid.NewGuid();
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = planId, Title = "Plan", Status = ActionPlanStatus.Ongoing, Type = ActionPlanType.PAC, OrganizationId = org, DepartmentId = dept,
                OwnerId = TestAuthHandler.TestUserId.ToString(), AssignedToId = TestAuthHandler.TestUserId.ToString(),
            });
            db.PlanActions.Add(new PlanAction { Id = actionId, Title = "Action", ActionPlanId = planId, AssignedToId = TestAuthHandler.TestUserId.ToString(), Deadline = DateTime.UtcNow.AddDays(5) });
            if (withProof)
                db.ActionDocuments.Add(new ActionDocument { Id = Guid.NewGuid(), PlanActionId = actionId, FileName = "preuve.jpg", FilePath = "x", FileType = "image/jpeg", UploadedBy = "u" });
            return Task.CompletedTask;
        });
        return actionId;
    }

    private HttpClient Client()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "user");
        return client;
    }

    [Fact]
    public async Task WithoutAProof_TheActionCannotReach100()
    {
        var id = await SeedActionAsync(withProof: false);
        var response = await Client().PatchAsJsonAsync($"/api/PlanAction/{id}/progress", new { progress = 100 });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("proofRequired", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task WithAProof_TheActionCanReach100()
    {
        var id = await SeedActionAsync(withProof: true);
        Assert.NotEqual(HttpStatusCode.Conflict, (await Client().PatchAsJsonAsync($"/api/PlanAction/{id}/progress", new { progress = 100 })).StatusCode);
    }

    [Fact]
    public async Task BelowHundred_NoProofIsNeeded()
    {
        var id = await SeedActionAsync(withProof: false);
        Assert.NotEqual(HttpStatusCode.Conflict, (await Client().PatchAsJsonAsync($"/api/PlanAction/{id}/progress", new { progress = 50 })).StatusCode);
    }
}
