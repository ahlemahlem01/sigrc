using System.Net;
using System.Net.Http.Json;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A closed claim is read-only: its analyses and its customer PDF are kept as they were when it was closed.</summary>
public class ClosedDossierTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private readonly ActionPlanApiFactory _factory;
    public ClosedDossierTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim(string status)
    {
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = id, Title = "t", DefectType = "Isolation", ClientId = "A", Severity = "HIGH", LotNumber = "L", Description = "d",
                StatusCode = status, CreatedById = Me, DetectionDate = DateTime.UtcNow,
            });
            return Task.CompletedTask;
        });
        return id;
    }

    [Fact]
    public async Task TheFiveWhy_CannotBeSaved_OnAClosedClaim()
    {
        var claim = await AddClaim("CLOTUREE");
        var response = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why", new { claimId = claim, statusCode = "DRAFT", problemStatement = "p" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("clôturé", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task TheFiveWhy_CanStillBeSaved_OnAnOpenClaim()
    {
        var claim = await AddClaim("EN_ANALYSE");
        var response = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why", new { claimId = claim, statusCode = "DRAFT", problemStatement = "p" });
        Assert.NotEqual(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task TheIshikawa_AndThePriorityCause_AreRefused_OnAClosedClaim()
    {
        var claim = await AddClaim("CLOTUREE");

        var cause = await ClientAs("user").PostAsJsonAsync("/api/Ishikawa/causes",
            new { claimId = claim, category = "Machine", causeDescription = "Usure", isRootCause = false, createdBy = "u" });
        Assert.Equal(HttpStatusCode.Conflict, cause.StatusCode);

        var priority = await ClientAs("user").PostAsJsonAsync($"/api/priority-cause/{claim}", new { text = "Usure", source = "manual" });
        Assert.Equal(HttpStatusCode.Conflict, priority.StatusCode);
    }

    [Fact]
    public async Task TheCustomerPdf_IsNotRegenerated_OnAClosedClaim()
    {
        var claim = await AddClaim("CLOTUREE");
        var response = await ClientAs("admin").PostAsync($"/api/EightD/{claim}/pdf", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }
}
