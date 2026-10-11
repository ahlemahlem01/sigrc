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

public class ClaimsAndMlEndpointsTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    private readonly HttpClient _client;
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public ClaimsAndMlEndpointsTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });
    }

    [Fact]
    public async Task CreateClaim_ReturnsOk_AndPersistsAssignedStatus()
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent("Réclamation test CI"), "Title" },
            { new StringContent("CLIENT-A"), "ClientId" },
            { new StringContent("Soudure"), "DefectType" },
            { new StringContent("HIGH"), "Severity" },
            { new StringContent(DateTime.UtcNow.ToString("o")), "DetectionDate" },
            { new StringContent("LOT-1"), "LotNumber" },
            { new StringContent("Description suffisamment longue pour le claim"), "Description" },
        };

        var response = await _client.PostAsync("/api/QualityAnalysis/claims", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        Assert.True(body.TryGetProperty("id", out var idProp));
        var claimId = idProp.GetGuid();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var claim = await db.Claims.AsNoTracking().FirstAsync(c => c.Id == claimId);
        Assert.Equal("ASSIGNED", claim.StatusCode);
        Assert.Equal(TestAuthHandler.TestUserId.ToString(), claim.AssignedToId);
        Assert.Equal("Réclamation test CI", claim.Title);
    }

    [Fact]
    public async Task AssignClaim_UpdatesAssignee()
    {
        var claimId = Guid.NewGuid();
        var assigneeId = Guid.Parse("22222222-2222-2222-2222-222222222222").ToString();

        await _factory.SeedAsync(async db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claimId,
                Title = "À assigner",
                ClientId = "C1",
                DefectType = "Soudure",
                Severity = "HIGH",
                LotNumber = "L1",
                Description = "test",
                StatusCode = "OUVERTE",
                CreatedAt = DateTime.UtcNow,
                CreatedById = TestAuthHandler.TestUserId.ToString()
            });
            await Task.CompletedTask;
        });

        var response = await _client.PatchAsJsonAsync(
            $"/api/QualityAnalysis/claims/{claimId}/assign",
            new { assignedToId = assigneeId, assignedToName = "Alice Test" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var claim = await db.Claims.AsNoTracking().FirstAsync(c => c.Id == claimId);
        Assert.Equal(assigneeId, claim.AssignedToId);
        Assert.Equal("Alice Test", claim.AssignedToName);
        Assert.Equal("ASSIGNED", claim.StatusCode);
    }

    [Fact]
    public async Task AssignActionPlan_ReturnsOk()
    {
        var orgId = Guid.NewGuid();
        var deptId = Guid.NewGuid();
        var planId = Guid.NewGuid();
        var userId = TestAuthHandler.TestUserId.ToString();

        await _factory.SeedAsync(async db =>
        {
            db.Organizations.Add(new Organization
            {
                Id = orgId,
                Name = "Org Test",
                Type = OrganizationType.Local
            });
            db.Departments.Add(new Department
            {
                Id = deptId,
                Name = "Qualité",
                Code = "QA",
                OrganizationId = orgId
            });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = planId,
                Title = "CAPA assign test",
                Status = ActionPlanStatus.Created,
                Type = ActionPlanType.PAC,
                OrganizationId = orgId,
                DepartmentId = deptId,
                OwnerId = userId,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = userId
            });
            await Task.CompletedTask;
        });

        var response = await _client.PostAsJsonAsync("/api/ActionPlan/assign", new
        {
            userId,
            actionPlanId = planId.ToString(),
            permissions = new { view = true, edit = true, delete = false }
        });

        if (response.StatusCode != HttpStatusCode.OK)
        {
            var err = await response.Content.ReadAsStringAsync();
            Assert.Fail($"{response.StatusCode}: {err}");
        }

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task AssignActionPlan_WithoutPermissions_ReturnsBadRequest()
    {
        var response = await _client.PostAsJsonAsync("/api/ActionPlan/assign", new
        {
            userId = TestAuthHandler.TestUserId.ToString(),
            actionPlanId = Guid.NewGuid().ToString()
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task MlTrainingDataset_ReturnsOkShape()
    {
        var response = await _client.GetAsync("/api/ml-features/training-dataset");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        Assert.True(body.TryGetProperty("count", out _));
        Assert.True(body.TryGetProperty("items", out var items));
        Assert.Equal(JsonValueKind.Array, items.ValueKind);
    }

    [Fact]
    public async Task MlAnomalyTimeseries_ReturnsOkShape()
    {
        var response = await _client.GetAsync("/api/ml-features/anomaly-timeseries?weeks=4");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        Assert.True(body.TryGetProperty("series", out _) || body.TryGetProperty("Series", out _));
    }
}
