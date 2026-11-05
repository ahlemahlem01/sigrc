using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>
/// The D4 chain rule, exercised against the in-memory database: with no priority cause and no release recorded,
/// the chain blocks, which is exactly what these cases check.
/// </summary>
public class D4ChainTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private readonly ActionPlanApiFactory _factory;
    public D4ChainTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim(string? createdBy, string status = "EN_ANALYSE", string? fiveWhyStatus = null, bool rootCause = false)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = "t", DefectType = "Soudure", ClientId = "A", Severity = "HIGH", LotNumber = "L",
            Description = "d", StatusCode = status, CreatedById = createdBy, DetectionDate = DateTime.UtcNow,
        });
        if (fiveWhyStatus != null)
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis { Id = Guid.NewGuid(), ClaimId = id, ProblemStatement = "p", StatusCode = fiveWhyStatus });
        if (rootCause)
            db.IshikawaCauses.Add(new IshikawaCause { Id = Guid.NewGuid(), ClaimId = id, Category = IshikawaCategory.Machine, CauseDescription = "Usure", IsRootCause = true, CreatedBy = "t" });
        await db.SaveChangesAsync();
        return id;
    }

    private async Task<D4ChainStatus> Evaluate(Guid claimId)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<D4ChainService>().EvaluateAsync(claimId);
    }

    [Fact]
    public async Task OpenDossier_NeedsBothTheCauseAndTheConfirmedRoot()
    {
        var status = await Evaluate(await AddClaim(Me));

        Assert.False(status.Exempt);
        Assert.False(status.Satisfied);
        Assert.Equal(new[] { "priorityCause", "rootInIshikawa" }, status.Missing);
    }

    [Fact]
    public async Task AConfirmedRootInTheIshikawa_IsRecognised()
    {
        var status = await Evaluate(await AddClaim(Me, rootCause: true));

        Assert.True(status.RootInIshikawa);
        Assert.Equal(new[] { "priorityCause" }, status.Missing);
    }

    [Theory]
    [InlineData("CLOTUREE", null)]
    [InlineData("VALIDATED", null)]
    [InlineData("EN_ANALYSE", "VALIDATED")]
    [InlineData("EN_ANALYSE", "PENDING_VALIDATION")]
    public async Task AlreadyValidatedOrClosed_IsExempt_AndNothingIsReLocked(string claimStatus, string? fiveWhyStatus)
    {
        var status = await Evaluate(await AddClaim(Me, claimStatus, fiveWhyStatus));

        Assert.True(status.Exempt);
        Assert.True(status.Satisfied);
    }

    [Fact]
    public async Task SendingTheFiveWhyForValidation_IsBlocked_UntilTheChainIsComplete()
    {
        var claimId = await AddClaim(Me);

        var response = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why", new { claimId, statusCode = "PENDING_VALIDATION" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, json.RootElement.GetProperty("missing").GetArrayLength());
    }

    [Fact]
    public async Task TheStatusEndpoint_CannotBeUsedToGetAround_TheRule()
    {
        var claimId = await AddClaim(Me, fiveWhyStatus: "DRAFT");
        Guid analysisId;
        using (var scope = _factory.Services.CreateScope())
            analysisId = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>().FiveWhyAnalyses.First(a => a.ClaimId == claimId).Id;

        var submit = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why/validate", new { analysisId, isApproved = false, statusCode = "PENDING_VALIDATION" });
        var approve = await ClientAs("admin").PostAsJsonAsync("/api/QualityAnalysis/5why/validate", new { analysisId, isApproved = true });

        Assert.Equal(HttpStatusCode.Conflict, submit.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, approve.StatusCode);
    }

    [Fact]
    public async Task Tools_OpenInOrder_IshikawaThenParetoThenFiveWhy()
    {
        // D3 not done and nothing started: everything is closed, with the reason of the first missing step.
        var fresh = await Evaluate(await AddClaim(Me));
        Assert.False(fresh.Tools.Ishikawa.Open);
        Assert.Equal("d3", fresh.Tools.Ishikawa.Reason);
        Assert.False(fresh.Tools.Pareto.Open);
        Assert.False(fresh.Tools.FiveWhy.Open);

        // Ishikawa causes listed: Pareto opens, the 5 Why still waits for the priority cause.
        var withCauses = await Evaluate(await AddClaim(Me, rootCause: true));
        Assert.True(withCauses.Tools.Ishikawa.Open);
        Assert.True(withCauses.Tools.Pareto.Open);
        Assert.False(withCauses.Tools.FiveWhy.Open);
        Assert.Equal("priorityCause", withCauses.Tools.FiveWhy.Reason);
    }

    [Theory]
    [InlineData("CLOTUREE", null)]
    [InlineData("EN_ANALYSE", "VALIDATED")]
    public async Task Tools_NeverLockBack_ClosedOrAlreadyValidatedDossiers(string claimStatus, string? fiveWhyStatus)
    {
        var status = await Evaluate(await AddClaim(Me, claimStatus, fiveWhyStatus));

        Assert.True(status.Tools.Ishikawa.Open && status.Tools.Pareto.Open && status.Tools.FiveWhy.Open);
    }

    [Fact]
    public async Task AFiveWhyAlreadyUnderWay_IsNotLockedBack()
    {
        var claimId = await AddClaim(Me, fiveWhyStatus: "DRAFT");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            var analysis = await db.FiveWhyAnalyses.FirstAsync(a => a.ClaimId == claimId);
            db.FiveWhySteps.Add(new FiveWhyStep { Id = Guid.NewGuid(), AnalysisId = analysis.Id, StepNumber = 1, Question = "Pourquoi ?", Answer = "Usure des électrodes" });
            await db.SaveChangesAsync();
        }

        var status = await Evaluate(claimId);

        Assert.True(status.Tools.FiveWhy.Open);
    }

    [Fact]
    public async Task IshikawaCauses_CannotBeAdded_BeforeD3_NorOnceTheClaimIsClosed()
    {
        var early = await AddClaim(Me);
        var started = await AddClaim(Me, "EN_ANALYSE", fiveWhyStatus: "PENDING_VALIDATION");
        var closed = await AddClaim(Me, "CLOTUREE");

        var blocked = await ClientAs("user").PostAsJsonAsync("/api/Ishikawa/causes", new { claimId = early, category = "Machine", causeDescription = "Usure", createdBy = "t" });
        var allowed = await ClientAs("user").PostAsJsonAsync("/api/Ishikawa/causes", new { claimId = started, category = "Machine", causeDescription = "Usure", createdBy = "t" });
        var readOnly = await ClientAs("user").PostAsJsonAsync("/api/Ishikawa/causes", new { claimId = closed, category = "Machine", causeDescription = "Usure", createdBy = "t" });

        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.NotEqual(HttpStatusCode.Conflict, allowed.StatusCode);   // already under way: never locked back
        Assert.Equal(HttpStatusCode.Conflict, readOnly.StatusCode);     // closed: read-only
    }

    [Fact]
    public async Task TheFiveWhy_CannotReceiveAnswers_BeforeIshikawaAndThePriorityCause()
    {
        var claimId = await AddClaim(Me, rootCause: true); // Ishikawa done, no priority cause yet
        var body = new { claimId, statusCode = "DRAFT", steps = new[] { new { stepNumber = 1, question = "Pourquoi ?", answer = "Usure" } } };

        var response = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why", body);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("priorityCause", json.RootElement.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task SavingADraft_IsNeverBlocked()
    {
        var claimId = await AddClaim(Me);

        var response = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why", new { claimId, statusCode = "DRAFT" });

        Assert.NotEqual(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task ADossierAlreadySubmitted_CanBeResubmitted_WithoutTheChain()
    {
        var claimId = await AddClaim(Me, fiveWhyStatus: "PENDING_VALIDATION");

        var response = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why", new { claimId, statusCode = "PENDING_VALIDATION" });

        Assert.NotEqual(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Release_IsAdminOnly_AndNeedsARealReason()
    {
        var claimId = await AddClaim(Me);

        var employee = await ClientAs("user").PostAsJsonAsync($"/api/d4-chain/{claimId}/override", new { reason = "Un motif suffisamment long" });
        Assert.Equal(HttpStatusCode.Forbidden, employee.StatusCode);

        var tooShort = await ClientAs("admin").PostAsJsonAsync($"/api/d4-chain/{claimId}/override", new { reason = "ok" });
        Assert.Equal(HttpStatusCode.BadRequest, tooShort.StatusCode);
    }

    [Fact]
    public async Task Status_IsVisibleToTheOwner_NotToOthers()
    {
        var mine = await AddClaim(Me);
        var others = await AddClaim("someone-else");

        Assert.Equal(HttpStatusCode.OK, (await ClientAs("user").GetAsync($"/api/d4-chain/{mine}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").GetAsync($"/api/d4-chain/{others}")).StatusCode);
    }
}
