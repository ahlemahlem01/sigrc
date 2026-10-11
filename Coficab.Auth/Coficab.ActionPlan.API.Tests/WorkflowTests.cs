using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.Workflow;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The configurable claim workflow: default rules, enforcement on status changes, and who can edit it.</summary>
public class WorkflowTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public WorkflowTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        // Creates the in-memory database, which also loads the default workflow (seed data of the model).
        _factory.SeedAsync(_ => Task.CompletedTask).GetAwaiter().GetResult();
    }

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim(string status)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = "t", DefectType = "Soudure", ClientId = "A", Severity = "HIGH", LotNumber = "L",
            Description = "d", StatusCode = status, DetectionDate = DateTime.UtcNow,
            CreatedById = TestAuthHandler.TestUserId.ToString(),
        });
        await db.SaveChangesAsync();
        return id;
    }

    private static object StatusChange(Guid id, string status) => new { id, statusCode = status };

    [Fact]
    public async Task DefaultWorkflow_IsSeeded_AndReadableByEveryone()
    {
        var response = await ClientAs("user").GetAsync("/api/workflow/claims");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("statuses").GetArrayLength() >= 6);
        Assert.True(doc.RootElement.GetProperty("transitions").GetArrayLength() >= 10);
    }

    [Fact]
    public async Task Employee_CannotCloseAClaim_ButAdminCan_FromPendingValidation()
    {
        var claim = await AddClaim("PENDING_VALIDATION");

        var denied = await ClientAs("user").PutAsJsonAsync($"/api/QualityAnalysis/claims/{claim}", StatusChange(claim, "CLOTUREE"));
        Assert.Equal(HttpStatusCode.Conflict, denied.StatusCode);
        Assert.Contains("workflow", await denied.Content.ReadAsStringAsync());

        var allowed = await ClientAs("superadmin").PutAsJsonAsync($"/api/QualityAnalysis/claims/{claim}", StatusChange(claim, "CLOTUREE"));
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
    }

    [Fact]
    public async Task UnlistedTransition_IsRefused_WithTheAllowedTargets()
    {
        var claim = await AddClaim("DRAFT");
        var response = await ClientAs("superadmin").PutAsJsonAsync($"/api/QualityAnalysis/claims/{claim}", StatusChange(claim, "CLOTUREE"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var allowed = doc.RootElement.GetProperty("allowed").EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.Contains("OUVERTE", allowed);
        Assert.DoesNotContain("CLOTUREE", allowed);
    }

    [Fact]
    public async Task OnlyASuperAdmin_CanChangeTheWorkflow_AndASwitchedOffTransitionBlocks()
    {
        var body = new
        {
            statuses = Array.Empty<object>(),
            transitions = new[] { new { from = "OUVERTE", to = "EN_ANALYSE", roles = new[] { "user" }, isActive = false } },
        };
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("admin").PutAsJsonAsync("/api/workflow/claims", body)).StatusCode);

        var saved = await ClientAs("superadmin").PutAsJsonAsync("/api/workflow/claims", body);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var claim = await AddClaim("OUVERTE");
        try
        {
            var blocked = await ClientAs("user").PutAsJsonAsync($"/api/QualityAnalysis/claims/{claim}", StatusChange(claim, "EN_ANALYSE"));
            Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        }
        finally
        {
            // Restore the default so the other tests are not affected (rows are only deactivated, never deleted).
            var restore = new
            {
                statuses = Array.Empty<object>(),
                transitions = new[] { new { from = "OUVERTE", to = "EN_ANALYSE", roles = new[] { "user", "admin", "superadmin" }, isActive = true } },
            };
            await ClientAs("superadmin").PutAsJsonAsync("/api/workflow/claims", restore);
        }
    }

    [Fact]
    public async Task InvalidConfiguration_IsRejected()
    {
        var client = ClientAs("superadmin");

        var badRole = new { statuses = Array.Empty<object>(), transitions = new[] { new { from = "OUVERTE", to = "ASSIGNED", roles = new[] { "boss" }, isActive = true } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/workflow/claims", badRole)).StatusCode);

        var self = new { statuses = Array.Empty<object>(), transitions = new[] { new { from = "OUVERTE", to = "OUVERTE", roles = new[] { "user" }, isActive = true } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/workflow/claims", self)).StatusCode);

        var unknown = new { statuses = Array.Empty<object>(), transitions = new[] { new { from = "OUVERTE", to = "INCONNU", roles = new[] { "user" }, isActive = true } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/workflow/claims", unknown)).StatusCode);
    }

    [Fact]
    public async Task AddedStatusAndTransition_WorkWithoutDeletingAnything()
    {
        var client = ClientAs("superadmin");
        var body = new
        {
            statuses = new[] { new { code = "EN_CONFINEMENT", label = "En confinement", sortOrder = 7, isFinal = false, isActive = true } },
            transitions = new[] { new { from = "EN_ANALYSE", to = "EN_CONFINEMENT", roles = new[] { "admin" }, isActive = true } },
        };
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/workflow/claims", body)).StatusCode);

        var claim = await AddClaim("EN_ANALYSE");
        Assert.Equal(HttpStatusCode.Conflict, (await ClientAs("user").PutAsJsonAsync($"/api/QualityAnalysis/claims/{claim}", StatusChange(claim, "EN_CONFINEMENT"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("admin").PutAsJsonAsync($"/api/QualityAnalysis/claims/{claim}", StatusChange(claim, "EN_CONFINEMENT"))).StatusCode);
    }

    [Theory]
    [InlineData("VALIDATED", "CLOTUREE")]   // legacy source status: never blocked
    [InlineData("OPEN", "OUVERTE")]         // alias of the same status
    [InlineData("EN_ANALYSE", "EN_ANALYSE")] // no change
    public async Task LegacyStatusesAndNoOps_AreNeverBlocked(string from, string to)
    {
        using var scope = _factory.Services.CreateScope();
        var workflow = scope.ServiceProvider.GetRequiredService<IClaimWorkflow>();
        var decision = await workflow.CheckAsync(from, to, new[] { "user" });
        Assert.True(decision.Allowed);
    }
}
