using System.Net;
using System.Net.Http.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>After the root cause is validated, the Ishikawa and the Pareto are final for the employee; an administrator can still change them, and it is traced.</summary>
public class ValidatedAnalysisLockTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ValidatedAnalysisLockTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<(Guid claimId, Guid causeId)> SeedAsync(string fiveWhyStatus)
    {
        var claimId = Guid.NewGuid();
        var causeId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "verrou ishikawa", Reference = $"REC-IK-{claimId.ToString()[..6]}", DefectType = "Vrillage du câble", ClientId = "A", Severity = "HIGH",
                LotNumber = "L", Description = "d", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow, CreatedById = TestAuthHandler.TestUserId.ToString(),
            });
            db.IshikawaCauses.Add(new IshikawaCause
            {
                Id = causeId, ClaimId = claimId, Category = IshikawaCategory.Machine, CauseDescription = "Frein du dévidoir mal réglé", CreatedBy = "u",
            });
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis { Id = Guid.NewGuid(), ClaimId = claimId, ProblemStatement = "p", StatusCode = fiveWhyStatus, CreatedBy = "u" });
            return Task.CompletedTask;
        });
        return (claimId, causeId);
    }

    private static object Scores => new { severity = 8, occurrence = 7, detection = 6 };

    [Fact]
    public async Task AnEmployee_CannotScoreOrArchiveACause_OnceTheRootCauseIsValidated()
    {
        var (_, causeId) = await SeedAsync("VALIDATED");
        var employee = As("user");
        Assert.Equal(HttpStatusCode.Conflict, (await employee.PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", Scores)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await employee.PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/archive", new { archivedBy = "x", archiveReason = "y" })).StatusCode);
    }

    [Fact]
    public async Task AnEmployee_StillWorksFreely_BeforeTheValidation()
    {
        var (_, causeId) = await SeedAsync("PENDING_VALIDATION");
        Assert.Equal(HttpStatusCode.OK, (await As("user").PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", Scores)).StatusCode);
    }

    [Fact]
    public async Task AnAdministrator_CanStillChangeIt_AndTheChangeIsTraced()
    {
        var (claimId, causeId) = await SeedAsync("VALIDATED");
        Assert.Equal(HttpStatusCode.OK, (await As("admin").PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", Scores)).StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var trace = db.ClaimEvents.Single(e => e.ClaimId == claimId && e.ActionType == "validated_analysis_amended");
        Assert.Contains("Après validation", trace.Detail);
    }

    [Fact]
    public async Task AnEmployee_CannotChangeThePriorityCause_OnceTheRootCauseIsValidated()
    {
        var (claimId, _) = await SeedAsync("VALIDATED");
        var response = await As("user").PostAsJsonAsync($"/api/priority-cause/{claimId}", new { text = "autre cause", source = "manual" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task TheAdministratorsChange_AppearsInTheVersionHistoryOfThe8D()
    {
        var (claimId, causeId) = await SeedAsync("VALIDATED");
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<Coficab.ActionPlan.Application.Interfaces.IEightDService>()
                .GetOrCreateAsync(claimId, TestAuthHandler.TestUserId.ToString());

        Assert.Equal(HttpStatusCode.OK, (await As("admin").PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", Scores)).StatusCode);

        using var check = _factory.Services.CreateScope();
        var versions = await check.ServiceProvider.GetRequiredService<Coficab.ActionPlan.Application.Interfaces.IEightDService>().GetVersionsAsync(claimId);
        Assert.Contains(versions, v => v.EventType == "amended" && (v.Comment ?? "").Contains("Après validation"));
    }
}
