using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Admin sends a CAPA back with a reason, the employee sees it, fixes it and resubmits.</summary>
public class PlanRejectionTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly ActionPlanApiFactory _factory;

    public PlanRejectionTests(ActionPlanApiFactory factory) => _factory = factory;

    private const string AdminId = "33333333-3333-3333-3333-333333333333";

    /// <summary>Employees act as the test user; admins as a separate person, like in real use.</summary>
    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (role != "user")
            client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, AdminId);
        return client;
    }

    private Mock<INotificationService> Notifications()
    {
        var mock = Mock.Get(_factory.Services.GetRequiredService<INotificationService>());
        mock.Invocations.Clear();
        return mock;
    }

    /// <summary>A plan assigned to the test user, finished and waiting for validation, with one done sub-action and one proof.</summary>
    private async Task<Guid> SeedPendingPlanAsync(int progress = 100)
    {
        var planId = Guid.NewGuid();
        var actionId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = planId,
                Title = $"CAPA {planId:N}",
                Status = ActionPlanStatus.Ongoing,
                Type = ActionPlanType.PAC,
                Progress = progress,
                OwnerId = AdminId,
                AssignedToId = Me,
                OrganizationId = Guid.NewGuid(),
                DepartmentId = Guid.NewGuid(),
                CreatedAt = DateTime.UtcNow,
            });
            db.UserActionPlanAssignments.Add(new UserActionPlanAssignment
            {
                Id = Guid.NewGuid(), UserId = Me, ActionPlanId = planId, CanView = true, CanEdit = true, CreatedAt = DateTime.UtcNow,
            });
            db.PlanActions.Add(new PlanAction
            {
                Id = actionId, ActionPlanId = planId, Title = "Corriger le gabarit", Progress = ActionProgress.Hundred, AssignedToId = Me,
            });
            db.ActionDocuments.Add(new ActionDocument
            {
                Id = Guid.NewGuid(), PlanActionId = actionId, FileName = "preuve.pdf", FilePath = "x", FileType = "PDF", UploadedBy = Me,
            });
            return Task.CompletedTask;
        });
        return planId;
    }

    private static async Task<List<JsonElement>> DataAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        return body.GetProperty("data").EnumerateArray().ToList();
    }

    private static JsonElement? Find(List<JsonElement> list, Guid id) =>
        list.Cast<JsonElement?>().FirstOrDefault(e => e!.Value.GetProperty("id").GetGuid() == id);

    [Fact]
    public async Task PendingValidation_ReportsProofCount()
    {
        var planId = await SeedPendingPlanAsync();

        var pending = await DataAsync(await ClientAs("admin").GetAsync("/api/ActionPlan/pending-validation"));

        Assert.Equal(1, Find(pending, planId)!.Value.GetProperty("proofCount").GetInt32());
    }

    [Fact]
    public async Task Reject_SendsPlanBack_EmployeeSeesIt_ResubmitReturnsItToTheQueue()
    {
        var planId = await SeedPendingPlanAsync();
        var notifications = Notifications();
        var admin = ClientAs("admin");

        var reject = await admin.PostAsJsonAsync($"/api/ActionPlan/{planId}/reject", new { comment = "Preuve illisible" });
        Assert.Equal(HttpStatusCode.OK, reject.StatusCode);

        notifications.Verify(n => n.NotifyAsync(
            Me, "plan_rejected", It.IsAny<string>(), It.Is<string>(m => m.Contains("Preuve illisible")),
            planId, $"/pages/front/my-action-plans/{planId}", null), Times.Once);

        Assert.Null(Find(await DataAsync(await admin.GetAsync("/api/ActionPlan/pending-validation")), planId));

        var forAdmin = Find(await DataAsync(await admin.GetAsync("/api/ActionPlan/rejected")), planId);
        Assert.NotNull(forAdmin);
        Assert.Equal("Preuve illisible", forAdmin!.Value.GetProperty("lastRejectComment").GetString());

        var employee = ClientAs("user");
        Assert.NotNull(Find(await DataAsync(await employee.GetAsync("/api/ActionPlan/rejected")), planId));

        notifications.Invocations.Clear();
        var resubmit = await employee.PostAsync($"/api/ActionPlan/assigned/{planId}/resubmit", null);
        Assert.Equal(HttpStatusCode.OK, resubmit.StatusCode);
        notifications.Verify(n => n.NotifyAdminsAsync(
            "plan_ready_for_validation", It.IsAny<string>(), It.IsAny<string>(), planId, null, It.IsAny<string?>(), Me), Times.Once);

        Assert.Null(Find(await DataAsync(await employee.GetAsync("/api/ActionPlan/rejected")), planId));
        Assert.NotNull(Find(await DataAsync(await admin.GetAsync("/api/ActionPlan/pending-validation")), planId));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var types = await db.ActionPlanHistories.Where(h => h.ActionPlanId == planId).Select(h => h.ActionType).ToListAsync();
        Assert.Contains("rejected", types);
        Assert.Contains("resubmitted", types);
    }

    [Fact]
    public async Task Reject_WithoutReason_IsRefused()
    {
        var planId = await SeedPendingPlanAsync();
        var response = await ClientAs("admin").PostAsJsonAsync($"/api/ActionPlan/{planId}/reject", new { comment = "  " });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Reject_PlanNotAwaitingValidation_IsRefused()
    {
        var planId = await SeedPendingPlanAsync(progress: 40);
        var response = await ClientAs("admin").PostAsJsonAsync($"/api/ActionPlan/{planId}/reject", new { comment = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Reject_ByEmployee_IsForbidden()
    {
        var planId = await SeedPendingPlanAsync();
        var response = await ClientAs("user").PostAsJsonAsync($"/api/ActionPlan/{planId}/reject", new { comment = "x" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Resubmit_PlanThatWasNeverRejected_IsRefused()
    {
        var planId = await SeedPendingPlanAsync(progress: 90);
        var response = await ClientAs("user").PostAsync($"/api/ActionPlan/assigned/{planId}/resubmit", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task RejectedRoute_IsNotTreatedAsAnId()
    {
        var response = await ClientAs("user").GetAsync("/api/ActionPlan/rejected");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
