using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The 5 Why has two branches (Occurrence and Detection), five steps each, and a root cause for each.</summary>
public class FiveWhyBranchTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public FiveWhyBranchTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient Client()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "user");
        return client;
    }

    private async Task<Guid> AddClaim()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = "t", DefectType = "Isolation", ClientId = "A", Severity = "HIGH", LotNumber = "L", Description = "d",
            StatusCode = "EN_ANALYSE", CreatedById = TestAuthHandler.TestUserId.ToString(), DetectionDate = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
        return id;
    }

    private static object[] TenSteps() =>
        new[] { "OCCURRENCE", "DETECTION" }
            .SelectMany(branch => Enumerable.Range(1, 5).Select(n => (object)new { stepNumber = n, branchType = branch, question = $"{branch} {n} ?", answer = "" }))
            .ToArray();

    [Fact]
    public async Task BothBranches_AreSaved_AndComeBackWithTheirRootCauses()
    {
        var claimId = await AddClaim();
        var body = new
        {
            claimId, statusCode = "DRAFT", problemStatement = "Isolation entaillée",
            rootCauseOccurrence = "Maintenance préventive absente", rootCauseDetection = "Plan de contrôle incomplet",
            steps = TenSteps(),
        };

        var save = await Client().PostAsJsonAsync("/api/QualityAnalysis/5why", body);
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        var read = await Client().GetAsync($"/api/QualityAnalysis/5why/{claimId}");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        using var json = JsonDocument.Parse(await read.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal("Maintenance préventive absente", root.GetProperty("rootCauseOccurrence").GetString());
        Assert.Equal("Plan de contrôle incomplet", root.GetProperty("rootCauseDetection").GetString());
        var steps = root.GetProperty("steps").EnumerateArray().ToList();
        Assert.Equal(10, steps.Count);
        Assert.Equal(5, steps.Count(s => s.GetProperty("branchType").GetString() == "OCCURRENCE"));
        Assert.Equal(5, steps.Count(s => s.GetProperty("branchType").GetString() == "DETECTION"));
    }

    [Fact]
    public async Task ASecondSave_ReplacesTheSteps_InsteadOfDuplicatingThem()
    {
        var claimId = await AddClaim();
        var body = new { claimId, statusCode = "DRAFT", problemStatement = "p", steps = TenSteps() };
        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsJsonAsync("/api/QualityAnalysis/5why", body)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsJsonAsync("/api/QualityAnalysis/5why", body)).StatusCode);

        using var json = JsonDocument.Parse(await Client().GetStringAsync($"/api/QualityAnalysis/5why/{claimId}"));
        Assert.Equal(10, json.RootElement.GetProperty("steps").GetArrayLength());
    }

    [Fact]
    public async Task MoreThanFiveStepsInABranch_IsRefused()
    {
        var claimId = await AddClaim();
        var steps = Enumerable.Range(1, 6).Select(n => new { stepNumber = n, branchType = "OCCURRENCE", question = "q", answer = "" }).ToArray();

        var response = await Client().PostAsJsonAsync("/api/QualityAnalysis/5why", new { claimId, statusCode = "DRAFT", problemStatement = "p", steps });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
