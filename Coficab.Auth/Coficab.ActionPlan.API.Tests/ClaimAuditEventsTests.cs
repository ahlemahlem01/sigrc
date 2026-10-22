using System.Net;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The claims audit log: recorded claim events, 8D history and imports, for quality admins only.</summary>
public class ClaimAuditEventsTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly ActionPlanApiFactory _factory;

    public ClaimAuditEventsTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    [Theory]
    [InlineData(TestAuthHandler.Anonymous, HttpStatusCode.Unauthorized)]
    [InlineData("user", HttpStatusCode.Forbidden)]
    public async Task Events_RequireAnAdmin(string role, HttpStatusCode expected)
        => Assert.Equal(expected, (await ClientAs(role).GetAsync("/api/QualityAnalysis/claims/events")).StatusCode);

    [Fact]
    public async Task Events_ListRecordedEventsEightDHistoryAndImports()
    {
        var claim = Guid.NewGuid();
        var batch = Guid.NewGuid();
        var tag = Guid.NewGuid().ToString("N")[..6];
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claim, Title = $"Claim-{tag}", DefectType = "Soudure", ClientId = "A", Severity = "HIGH", LotNumber = "L",
                Description = "d", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow,
            });
            db.ClaimEvents.Add(new ClaimEvent { ClaimId = claim, ActionType = "claim_archived", ActorId = "someone", Detail = "x" });
            db.EightDVersions.Add(new EightDVersion
            {
                DossierId = Guid.NewGuid(), ClaimId = claim, VersionNumber = 2, EventType = "approved", SavedById = "someone", CurrentStep = 8, Comment = "ok",
            });
            db.EightDVersions.Add(new EightDVersion { DossierId = Guid.NewGuid(), ClaimId = claim, VersionNumber = 1, EventType = "baseline" });
            db.ImportBatches.Add(new ImportBatch { Id = batch, FileName = $"h-{tag}.xlsx", CreatedBy = "someone", ClaimCount = 3, CauseCount = 1 });
            return Task.CompletedTask;
        });

        var response = await ClientAs("superadmin").GetAsync("/api/QualityAnalysis/claims/events");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var items = doc.RootElement.EnumerateArray().Select(e => (
            Type: e.GetProperty("actionType").GetString(),
            Claim: e.GetProperty("claimId").ValueKind == JsonValueKind.Null ? Guid.Empty : e.GetProperty("claimId").GetGuid(),
            Title: e.GetProperty("claimTitle").GetString())).ToList();

        Assert.Contains(items, i => i.Type == "claim_archived" && i.Claim == claim && i.Title == $"Claim-{tag}");
        Assert.Contains(items, i => i.Type == "eightd_validated" && i.Claim == claim);
        Assert.DoesNotContain(items, i => i.Claim == claim && i.Type == "eightd_saved"); // the baseline is not an event
        Assert.Contains(items, i => i.Type == "claim_imported" && i.Title == $"h-{tag}.xlsx");
    }

    [Fact]
    public async Task ArchivingAndRestoringAClaim_AreRecorded()
    {
        var claim = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claim, Title = "to archive", DefectType = "Soudure", ClientId = "A", Severity = "LOW", LotNumber = "L",
                Description = "d", StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow,
            });
            return Task.CompletedTask;
        });
        var client = ClientAs("superadmin");

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/QualityAnalysis/claims/{claim}/archive", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/QualityAnalysis/claims/{claim}/restore", null)).StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var types = db.ClaimEvents.Where(e => e.ClaimId == claim).Select(e => e.ActionType).ToList();
        Assert.Contains("claim_archived", types);
        Assert.Contains("claim_restored", types);
    }
}
