using System.Net;
using System.Net.Http.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Application.Services;
using Coficab.Auth.API.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The rights of the permission matrix: held by administrators through their role, delegated to others one by one.</summary>
public class PermissionDelegationTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private readonly ActionPlanApiFactory _factory;
    public PermissionDelegationTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role, string? permission = null)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (permission != null) client.DefaultRequestHeaders.Add(TestAuthHandler.PermissionHeader, permission);
        return client;
    }

    [Fact]
    public void TheNewRights_AreInTheCatalog_AdministratorsHoldAll_AndEmployeesOnlyTheirDailyOnes()
    {
        foreach (var name in new[] { "capa:extend_deadline", "capa:reassign", "analysis:validate_fivewhy", "8d:validate" })
            Assert.True(ProjectPermissionCatalog.IsSupported(name), name);

        var admin = RolePermissionDefaults.For(new[] { "admin" });
        Assert.Equal(ProjectPermissionCatalog.Names.Count, admin.Count);
        Assert.Equal(admin, RolePermissionDefaults.For(new[] { "SuperAdmin" }));

        var employee = RolePermissionDefaults.For(new[] { "user" });
        Assert.Contains("claims:create", employee);
        Assert.DoesNotContain("capa:extend_deadline", employee);
        Assert.DoesNotContain("8d:validate", employee);
        Assert.All(employee, p => Assert.True(ProjectPermissionCatalog.IsSupported(p), p));
    }

    private async Task<Guid> LateAction()
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
                Id = plan, Title = "CAPA", Status = ActionPlanStatus.Ongoing, Type = ActionPlanType.PAC, OwnerId = Me, AssignedToId = Me,
                OrganizationId = org, DepartmentId = dept, CreatedAt = DateTime.UtcNow,
            });
            db.PlanActions.Add(new PlanAction
            {
                Id = action, ActionPlanId = plan, Title = "Remplacer", Progress = ActionProgress.Fifty, AssignedToId = Me,
                Deadline = DateTime.UtcNow.Date.AddDays(-5),
            });
            return Task.CompletedTask;
        });
        return action;
    }

    private static Task<HttpResponseMessage> Extend(HttpClient c, Guid action) =>
        c.PostAsJsonAsync($"/api/planaction/{action}/deadline-extension", new { newDeadline = DateTime.UtcNow.Date.AddDays(10).ToString("yyyy-MM-dd"), reason = "Motif suffisamment long" });

    [Fact]
    public async Task AnEmployee_CanExtendADeadline_OnlyWithTheRight()
    {
        var action = await LateAction();
        Assert.Equal(HttpStatusCode.Forbidden, (await Extend(ClientAs("user"), action)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Extend(ClientAs("user", "capa:reassign"), action)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Extend(ClientAs("user", "capa:extend_deadline"), action)).StatusCode);
    }

    [Fact]
    public async Task AnEmployee_CanReassign_OnlyWithTheRight()
    {
        var action = await LateAction();
        var body = new { userId = "55555555-5555-5555-5555-555555555555" };
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PostAsJsonAsync($"/api/planaction/{action}/reassign", body)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("user", "capa:reassign").PostAsJsonAsync($"/api/planaction/{action}/reassign", body)).StatusCode);
    }

    [Fact]
    public async Task ApprovingAFiveWhy_NeedsTheRight_ButSubmittingOneDoesNot()
    {
        var response = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why/validate", new { analysisId = Guid.NewGuid(), isApproved = true });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        // with the right the request goes through to the analysis (which does not exist here)
        var allowed = await ClientAs("user", "analysis:validate_fivewhy").PostAsJsonAsync("/api/QualityAnalysis/5why/validate", new { analysisId = Guid.NewGuid(), isApproved = true });
        Assert.NotEqual(HttpStatusCode.Forbidden, allowed.StatusCode);
    }

    [Fact]
    public async Task ValidatingAnEightD_NeedsTheRight()
    {
        var claim = Guid.NewGuid();
        var body = new { isApproved = true, comment = "ok" };
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PostAsJsonAsync($"/api/EightD/{claim}/validate", body)).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, (await ClientAs("user", "8d:validate").PostAsJsonAsync($"/api/EightD/{claim}/validate", body)).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, (await ClientAs("admin").PostAsJsonAsync($"/api/EightD/{claim}/validate", body)).StatusCode);
    }

    private sealed class RecordingAssistant : IQualityAssistantService
    {
        public bool? LastIsAdmin;
        public Task<QualityAssistantChatResult> ChatAsync(string userId, bool isAdmin, string message,
            IReadOnlyList<QualityAssistantMessageDto>? history, string? language = null, CancellationToken cancellationToken = default)
        {
            LastIsAdmin = isAdmin;
            return Task.FromResult(new QualityAssistantChatResult("ok"));
        }
    }

    private async Task<(string scope, bool? isAdmin)> AskAssistant(string role, string? permission)
    {
        var recorder = new RecordingAssistant();
        var factory = _factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
        {
            services.RemoveAll<IQualityAssistantService>();
            services.AddSingleton<IQualityAssistantService>(recorder);
        }));
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (permission != null) client.DefaultRequestHeaders.Add(TestAuthHandler.PermissionHeader, permission);
        var response = await client.PostAsJsonAsync("/api/quality-assistant/chat", new { message = "Combien de réclamations dans l'organisation ?" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return (json.RootElement.GetProperty("scope").GetString()!, recorder.LastIsAdmin);
    }

    [Fact]
    public async Task TheAssistant_AnswersWithAdministratorData_ForAnEmployeeOnlyWithTheRight()
    {
        Assert.Equal(("employee", (bool?)false), await AskAssistant("user", null));
        Assert.Equal(("employee", (bool?)false), await AskAssistant("user", "capa:reassign"));
        Assert.Equal(("admin", (bool?)true), await AskAssistant("user", "assistant:unrestricted"));
        Assert.Equal(("admin", (bool?)true), await AskAssistant("admin", null));
    }
}
