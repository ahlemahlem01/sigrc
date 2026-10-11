using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>GET api/employee/workspace: the dashboard's single request.</summary>
public class EmployeeWorkspaceTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly ActionPlanApiFactory _factory;

    public EmployeeWorkspaceTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    [Fact]
    public async Task Anonymous_IsRejected()
    {
        var response = await ClientAs(TestAuthHandler.Anonymous).GetAsync("/api/employee/workspace");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ReturnsClaimsPlansActionsAndEightD_WithoutCreatingDossiers()
    {
        var openClaim = Guid.NewGuid();
        var closedClaim = Guid.NewGuid();
        var planId = Guid.NewGuid();
        var actionId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            foreach (var (id, status) in new[] { (openClaim, "EN_ANALYSE"), (closedClaim, "CLOTUREE") })
            {
                db.Claims.Add(new Claim
                {
                    Id = id, Title = $"Claim {status}", ClientId = "C1", DefectType = "Soudure", Severity = "HIGH",
                    LotNumber = "L1", Description = "d", StatusCode = status, AssignedToId = Me,
                    CreatedById = "someone-else", CreatedAt = DateTime.UtcNow, Deadline = DateTime.UtcNow.AddDays(3),
                });
            }
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = planId, Title = "Plan workspace", Status = ActionPlanStatus.Ongoing, Type = ActionPlanType.PAC,
                Progress = 50, OwnerId = "owner", AssignedToId = Me, OrganizationId = Guid.NewGuid(),
                DepartmentId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow,
            });
            db.UserActionPlanAssignments.Add(new UserActionPlanAssignment
            {
                Id = Guid.NewGuid(), UserId = Me, ActionPlanId = planId, CanView = true, CanEdit = true, CreatedAt = DateTime.UtcNow,
            });
            db.Documents.Add(new Document { Id = Guid.NewGuid(), Name = "Attestation.pdf", Type = "PDF", UserId = Me, FilePath = "App_Data/documents/x.pdf" });
            db.Documents.Add(new Document { Id = Guid.NewGuid(), Name = "Autre.pdf", Type = "PDF", UserId = "someone-else", FilePath = "App_Data/documents/y.pdf" });
            db.Badges.Add(new Badge { Id = Guid.NewGuid(), UserId = Me, Name = "Premier Plan", Category = "first-plan" });
            db.PlanActions.Add(new PlanAction
            {
                Id = actionId, ActionPlanId = planId, Title = "Sous-action", Progress = ActionProgress.Fifty, AssignedToId = Me,
            });
            return Task.CompletedTask;
        });

        var response = await ClientAs("user").GetAsync("/api/employee/workspace");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);

        var claimIds = body.GetProperty("claims").EnumerateArray().Select(c => c.GetProperty("id").GetGuid()).ToList();
        Assert.Contains(openClaim, claimIds);
        Assert.Contains(closedClaim, claimIds);

        Assert.Contains(body.GetProperty("plans").EnumerateArray(), p => p.GetProperty("id").GetString() == planId.ToString());

        var action = Assert.Single(body.GetProperty("planActions").EnumerateArray(), a => a.GetProperty("id").GetGuid() == actionId);
        Assert.Equal(50, action.GetProperty("progress").GetInt32());

        // 8D only for open claims, with its steps.
        var eightDClaims = body.GetProperty("eightD").EnumerateArray().Select(d => d.GetProperty("claimId").GetGuid()).ToList();
        Assert.Contains(openClaim, eightDClaims);
        Assert.DoesNotContain(closedClaim, eightDClaims);
        var open8D = body.GetProperty("eightD").EnumerateArray().First(d => d.GetProperty("claimId").GetGuid() == openClaim);
        Assert.NotEmpty(open8D.GetProperty("steps").EnumerateArray());

        Assert.Equal(JsonValueKind.Array, body.GetProperty("rejectedPlans").ValueKind);

        var docs = body.GetProperty("recentDocuments").EnumerateArray().Select(d => d.GetProperty("name").GetString()).ToList();
        Assert.Contains("Attestation.pdf", docs);
        Assert.DoesNotContain("Autre.pdf", docs);
        Assert.Contains(body.GetProperty("recentBadges").EnumerateArray(), b => b.GetProperty("name").GetString() == "Premier Plan");

        // Reading the dashboard must not create 8D dossiers.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        Assert.False(await db.EightDDossiers.AnyAsync(d => d.ClaimId == openClaim));
    }
}
