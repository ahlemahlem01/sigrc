using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A plan built from a 5 Why is approved by an administrator before its actions are carried out.</summary>
public class PlanApprovalTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public PlanApprovalTests(ActionPlanApiFactory factory) => _factory = factory;

    private static readonly string Employee = TestAuthHandler.TestUserId.ToString();

    private static readonly string AdminId = "22222222-2222-2222-2222-222222222222";

    /// <summary>The administrator and the employee are two different people.</summary>
    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (role == "admin") client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, AdminId);
        return client;
    }

    private async Task<(Guid planId, Guid claimId)> SeedAsync(PlanApprovalStatus approval, string owner = "someone-else", string? assignedTo = null, string? comment = null)
    {
        var claimId = Guid.NewGuid();
        var planId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            var org = Guid.NewGuid();
            var dept = Guid.NewGuid();
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "approbation", Reference = $"REC-AP-{claimId.ToString()[..6]}", DefectType = "Vrillage du câble", ClientId = "A", Severity = "HIGH",
                LotNumber = "L", Description = "d", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow, CreatedById = AdminId,
            });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = planId, Title = "Plan CAPA", Status = ActionPlanStatus.Created, Type = ActionPlanType.PAC, ClaimId = claimId,
                OrganizationId = org, DepartmentId = dept, OwnerId = owner, AssignedToId = assignedTo, CreatedBy = owner,
                ApprovalStatus = approval, ApprovalComment = comment,
            });
            return Task.CompletedTask;
        });
        return (planId, claimId);
    }

    private PlanApprovalStatus StatusOf(Guid planId)
    {
        using var scope = _factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>().ActionPlans.Single(p => p.Id == planId).ApprovalStatus;
    }

    private ActionPlanStatus StatusCodeOf(Guid planId)
    {
        using var scope = _factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>().ActionPlans.Single(p => p.Id == planId).Status;
    }

    [Fact]
    public async Task NoProgress_UntilTheAdministratorApproved_ThenItWorks()
    {
        var (planId, _) = await SeedAsync(PlanApprovalStatus.Pending, assignedTo: Employee);
        var employee = As("user");

        var blocked = await employee.PatchAsJsonAsync($"/api/ActionPlan/assigned/{planId}/progress", new { progress = 10 });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal("planNotApproved", (await blocked.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        Assert.Equal(HttpStatusCode.OK, (await As("admin").PostAsJsonAsync($"/api/validations/plans/{planId}/approve", new { })).StatusCode);
        Assert.Equal(PlanApprovalStatus.Approved, StatusOf(planId));
        Assert.Equal(ActionPlanStatus.Ongoing, StatusCodeOf(planId));   // approved: the plan is now being carried out
        Assert.NotEqual(HttpStatusCode.Conflict, (await employee.PatchAsJsonAsync($"/api/ActionPlan/assigned/{planId}/progress", new { progress = 10 })).StatusCode);
    }

    [Fact]
    public async Task AnEmployee_CannotApprove()
    {
        var (planId, _) = await SeedAsync(PlanApprovalStatus.Pending);
        Assert.Equal(HttpStatusCode.Forbidden, (await As("user").PostAsJsonAsync($"/api/validations/plans/{planId}/approve", new { })).StatusCode);
        Assert.Equal(PlanApprovalStatus.Pending, StatusOf(planId));
    }

    [Fact]
    public async Task TheAuthorOfThePlan_CannotApproveItHimself()
    {
        var (planId, _) = await SeedAsync(PlanApprovalStatus.Pending, owner: AdminId);
        var response = await As("admin").PostAsJsonAsync($"/api/validations/plans/{planId}/approve", new { });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("selfApproval", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task ReturningNeedsAReason_TellsTheAuthor_AndTheAuthorCanSubmitAgain()
    {
        var (planId, claimId) = await SeedAsync(PlanApprovalStatus.Pending, assignedTo: Employee);
        var admin = As("admin");

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/validations/plans/{planId}/return", new { comment = " " })).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/validations/plans/{planId}/return", new { comment = "Délais trop courts" })).StatusCode);
        Assert.Equal(PlanApprovalStatus.Returned, StatusOf(planId));
        _factory.Notifier.Verify(n => n.NotifyAsync(Employee, "plan_returned", It.IsAny<string>(), It.Is<string>(m => m.Contains("Délais trop courts")),
            planId, It.IsAny<string?>(), claimId), Times.Once);

        // still blocked while returned, and visible to its author with the reason
        Assert.Equal(HttpStatusCode.Conflict, (await As("user").PatchAsJsonAsync($"/api/ActionPlan/assigned/{planId}/progress", new { progress = 10 })).StatusCode);
        var mine = (await As("user").GetFromJsonAsync<JsonElement>("/api/my-validations")).EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == planId);
        Assert.Equal("returned", mine.GetProperty("approval").GetString());

        Assert.Equal(HttpStatusCode.OK, (await As("user").PostAsync($"/api/my-validations/plans/{planId}/resubmit", null)).StatusCode);
        Assert.Equal(PlanApprovalStatus.Pending, StatusOf(planId));
    }

    [Fact]
    public async Task ThePlansToApprove_AreListedForTheAdministrator_AndTheEmployeeCanRemindThem()
    {
        var (planId, _) = await SeedAsync(PlanApprovalStatus.Pending, assignedTo: Employee);
        var queue = (await As("admin").GetFromJsonAsync<JsonElement>("/api/validations/plans/approval")).EnumerateArray().ToArray();
        Assert.Contains(queue, r => r.GetProperty("planId").GetGuid() == planId);

        var mine = (await As("user").GetFromJsonAsync<JsonElement>("/api/my-validations")).EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == planId);
        Assert.Equal("pending", mine.GetProperty("approval").GetString());
        Assert.True(mine.GetProperty("ready").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await As("user").PostAsJsonAsync("/api/my-validations/remind", new { kind = "capa", targetId = planId })).StatusCode);
    }

    [Theory]
    [InlineData(null, 0, PlanApprovalStatus.Approved, "inProgress")]
    [InlineData(ActionPlanStatus.Created, 0, PlanApprovalStatus.Pending, "toApprove")]
    [InlineData(ActionPlanStatus.Created, 0, PlanApprovalStatus.Returned, "returned")]
    [InlineData(ActionPlanStatus.Ongoing, 100, PlanApprovalStatus.Approved, "toValidate")]
    [InlineData(ActionPlanStatus.Closed, 100, PlanApprovalStatus.Approved, "validated")]
    public void TheThread_SaysWhereThePlanStands(ActionPlanStatus? status, int progress, PlanApprovalStatus approval, string expected)
    {
        var step = Coficab.ActionPlan.Application.QualityAnalyses.Services.ValidationThread.PlanStep(status, progress, approval);
        Assert.Equal(status is null ? "none" : expected, step);
    }
}
