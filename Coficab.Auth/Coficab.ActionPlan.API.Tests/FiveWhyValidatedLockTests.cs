using System.Net;
using System.Net.Http.Json;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>What the administrator validated is final for the employee: a validated 5 Why cannot be rewritten or sent back to draft by them.</summary>
public class FiveWhyValidatedLockTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public FiveWhyValidatedLockTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<(Guid claimId, Guid analysisId)> SeedValidatedAsync()
    {
        var claimId = Guid.NewGuid();
        var analysisId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "verrou", Reference = $"REC-LOCK-{claimId.ToString()[..6]}", DefectType = "Vrillage du câble", ClientId = "A", Severity = "HIGH",
                LotNumber = "L", Description = "d", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow, CreatedById = TestAuthHandler.TestUserId.ToString(),
            });
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis
            {
                Id = analysisId, ClaimId = claimId, ProblemStatement = "p", StatusCode = "VALIDATED", CreatedBy = "u",
                RootCauseOccurrence = "cause A", RootCauseDetection = "cause B",
            });
            return Task.CompletedTask;
        });
        return (claimId, analysisId);
    }

    [Fact]
    public async Task AnEmployee_CannotRewriteAValidated5Why()
    {
        var (claimId, _) = await SeedValidatedAsync();
        var response = await As("user").PostAsJsonAsync("/api/QualityAnalysis/5why",
            new { claimId, problemStatement = "modifié", statusCode = "DRAFT", steps = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task AnEmployee_CannotSendAValidated5WhyBackToDraft()
    {
        var (claimId, analysisId) = await SeedValidatedAsync();
        var response = await As("user").PostAsJsonAsync("/api/QualityAnalysis/5why/validate",
            new { analysisId, claimId, isApproved = false, statusCode = "DRAFT" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }
}
