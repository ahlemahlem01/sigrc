using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Prospective Pareto: the analyst scores each Ishikawa cause (severity, occurrence, detection, 1 to 10), independent of any history.</summary>
public class IshikawaRiskTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public IshikawaRiskTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient Client()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "admin");
        return client;
    }

    private async Task<(Guid claimId, Guid causeId)> SeedAsync(string status = "OUVERTE")
    {
        var claimId = Guid.NewGuid();
        var causeId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "pareto prospectif", DefectType = "Vrillage du câble", ClientId = "A", Severity = "HIGH", LotNumber = "L", Description = "d",
                StatusCode = status, DetectionDate = DateTime.UtcNow, CreatedById = TestAuthHandler.TestUserId.ToString(),
            });
            db.IshikawaCauses.Add(new IshikawaCause
            {
                Id = causeId, ClaimId = claimId, Category = IshikawaCategory.Machine, CauseDescription = "Frein du dévidoir mal réglé",
                CreatedBy = TestAuthHandler.TestUserId.ToString(),
            });
            return Task.CompletedTask;
        });
        return (claimId, causeId);
    }

    private T Query<T>(Func<ActionPlanDbContext, T> read)
    {
        using var scope = _factory.Services.CreateScope();
        return read(scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>());
    }

    private static async Task<string?> CodeOf(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("code", out var c) ? c.GetString() : null;

    [Fact]
    public void TheCriticality_IsTheProductOfTheThreeScores_AndEmptyUntilAllThreeAreGiven()
    {
        Assert.Equal(336, Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa.IshikawaRiskRules.Criticality(8, 7, 6));
        Assert.Null(Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa.IshikawaRiskRules.Criticality(8, 7, null));
    }

    [Fact]
    public async Task ScoresAreSaved_ReturnedByTheDiagram_AndTraced()
    {
        var (claimId, causeId) = await SeedAsync();
        var r = await Client().PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", new { severity = 8, occurrence = 7, detection = 6 });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(336, (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("criticality").GetInt32());

        var cause = Query(db => db.IshikawaCauses.Single(c => c.Id == causeId));
        Assert.Equal((8, 7, 6), (cause.RiskSeverity, cause.RiskOccurrence, cause.RiskDetection));

        var diagram = await Client().GetFromJsonAsync<JsonElement>($"/api/Ishikawa/claims/{claimId}");
        var first = diagram.GetProperty("categories")[0].GetProperty("causes")[0];
        Assert.Equal(8, first.GetProperty("riskSeverity").GetInt32());
        Assert.Equal(6, first.GetProperty("riskDetection").GetInt32());

        var ev = Query(db => db.ClaimEvents.Single(e => e.ClaimId == claimId && e.ActionType == "ishikawa_risk_scored"));
        Assert.Contains("= 336", ev.Detail);
        Assert.Contains("Frein du dévidoir", ev.Detail);
    }

    [Theory]
    [InlineData(0, 5, 5, "outOfRange")]
    [InlineData(5, 11, 5, "outOfRange")]
    [InlineData(5, 5, -1, "outOfRange")]
    [InlineData(5, null, 5, "allOrNone")]
    [InlineData(5, null, null, "allOrNone")]
    public async Task InvalidScores_AreRefused_AndNothingChanges(int? s, int? o, int? d, string code)
    {
        var (claimId, causeId) = await SeedAsync();
        var r = await Client().PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", new { severity = s, occurrence = o, detection = d });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal(code, await CodeOf(r));
        Assert.Null(Query(db => db.IshikawaCauses.Single(c => c.Id == causeId).RiskSeverity));
        Assert.Empty(Query(db => db.ClaimEvents.Where(e => e.ClaimId == claimId && e.ActionType == "ishikawa_risk_scored").ToList()));
    }

    [Fact]
    public async Task SendingNoScore_ClearsTheScores()
    {
        var (_, causeId) = await SeedAsync();
        await Client().PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", new { severity = 9, occurrence = 2, detection = 3 });
        var r = await Client().PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", new { });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var cause = Query(db => db.IshikawaCauses.Single(c => c.Id == causeId));
        Assert.Null(cause.RiskSeverity);
        Assert.Null(cause.RiskOccurrence);
        Assert.Null(cause.RiskDetection);
    }

    [Fact]
    public async Task AnUnknownCause_IsNotFound()
    {
        var r = await Client().PutAsJsonAsync($"/api/Ishikawa/causes/{Guid.NewGuid()}/risk", new { severity = 5, occurrence = 5, detection = 5 });
        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
    }

    [Fact]
    public async Task AClosedDossier_CannotBeScored()
    {
        var (_, causeId) = await SeedAsync("CLOTUREE");
        var r = await Client().PutAsJsonAsync($"/api/Ishikawa/causes/{causeId}/risk", new { severity = 5, occurrence = 5, detection = 5 });
        Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
        Assert.Null(Query(db => db.IshikawaCauses.Single(c => c.Id == causeId).RiskSeverity));
    }
}
