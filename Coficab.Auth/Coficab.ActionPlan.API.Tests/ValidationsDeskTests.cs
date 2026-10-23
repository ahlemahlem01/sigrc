using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

public class ValidationsDeskTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly ActionPlanApiFactory _factory;
    private readonly HttpClient _client;

    public ValidationsDeskTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    private static readonly string Author = Guid.Parse("33333333-3333-3333-3333-333333333333").ToString();

    private async Task<Guid> SeedClaimAsync(string status)
    {
        var id = Guid.NewGuid();
        await _factory.SeedAsync(async db =>
        {
            db.Claims.Add(new Claim
            {
                Id = id, Title = "Dossier à décider", ClientId = "C1", DefectType = "Soudure", Severity = "HIGH", LotNumber = "L1",
                Description = "test", StatusCode = status, CreatedAt = DateTime.UtcNow.AddDays(-3), CreatedById = Author,
            });
            await Task.CompletedTask;
        });
        return id;
    }

    [Fact]
    public async Task Return_NeedsAReason()
    {
        var id = await SeedClaimAsync("PENDING_VALIDATION");
        var response = await _client.PostAsJsonAsync("/api/validations/dossiers/decide", new { claimIds = new[] { id }, approve = false });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Return_SendsTheFileBackAsDraft_KeepsTheReasonInTheHistory()
    {
        var id = await SeedClaimAsync("PENDING_VALIDATION");
        var response = await _client.PostAsJsonAsync("/api/validations/dossiers/decide",
            new { claimIds = new[] { id }, approve = false, comment = "Précisez le lot concerné." });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        Assert.True(body.GetProperty("results")[0].GetProperty("ok").GetBoolean());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        Assert.Equal("DRAFT", (await db.Claims.AsNoTracking().FirstAsync(c => c.Id == id)).StatusCode);
        Assert.Contains(await db.ClaimEvents.AsNoTracking().Where(e => e.ClaimId == id).ToListAsync(),
            e => e.ActionType == "claim_validation_returned" && e.Detail!.Contains("Précisez le lot concerné."));
    }

    [Fact]
    public async Task Approve_OpensSeveralFilesAtOnce_AndRefusesTheOnesNotWaiting()
    {
        var a = await SeedClaimAsync("PENDING_VALIDATION");
        var b = await SeedClaimAsync("PENDING_VALIDATION");
        var notWaiting = await SeedClaimAsync("OUVERTE");

        var response = await _client.PostAsJsonAsync("/api/validations/dossiers/decide",
            new { claimIds = new[] { a, b, notWaiting }, approve = true });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var results = (await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("results").EnumerateArray().ToList();
        Assert.Equal(2, results.Count(r => r.GetProperty("ok").GetBoolean()));
        Assert.False(results.Single(r => r.GetProperty("id").GetGuid() == notWaiting).GetProperty("ok").GetBoolean());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        Assert.Equal("OUVERTE", (await db.Claims.AsNoTracking().FirstAsync(c => c.Id == a)).StatusCode);
        Assert.Equal("OUVERTE", (await db.Claims.AsNoTracking().FirstAsync(c => c.Id == b)).StatusCode);
    }

    [Fact]
    public async Task Decide_IsForbiddenToAnEmployee()
    {
        var id = await SeedClaimAsync("PENDING_VALIDATION");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/validations/dossiers/decide")
        {
            Content = JsonContent.Create(new { claimIds = new[] { id }, approve = true }),
        };
        request.Headers.Add(TestAuthHandler.RoleHeader, "user");
        Assert.Equal(HttpStatusCode.Forbidden, (await _client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task FiveWhyQueue_ListsTheAnalysesWaitingForADecision()
    {
        var claimId = await SeedClaimAsync("EN_ANALYSE");
        var analysisId = Guid.NewGuid();
        await _factory.SeedAsync(async db =>
        {
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis
            {
                Id = analysisId, ClaimId = claimId, ProblemStatement = "Problème", RootCause = "Cause", StatusCode = "PENDING_VALIDATION",
            });
            await Task.CompletedTask;
        });

        var response = await _client.GetAsync("/api/validations/five-why");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = (await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).EnumerateArray().ToList();
        Assert.Contains(rows, r => r.GetProperty("analysisId").GetGuid() == analysisId && r.GetProperty("claimId").GetGuid() == claimId);
    }

    [Fact]
    public async Task Deadlines_ListOpenItemsAndRecentClosedOnes_ButNotOldClosedOnes()
    {
        var late = await SeedClaimAsync("OUVERTE");
        var validated = await SeedClaimAsync("VALIDATED");
        var oldClosed = await SeedClaimAsync("CLOTUREE");
        await _factory.SeedAsync(async db =>
        {
            foreach (var c in db.Claims.Where(c => c.Id == late || c.Id == validated || c.Id == oldClosed))
                c.Deadline = c.Id == oldClosed ? DateTime.UtcNow.AddDays(-400) : DateTime.UtcNow.AddDays(-5);
            await Task.CompletedTask;
        });

        var response = await _client.GetAsync("/api/admin/deadlines");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var items = (await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("items").EnumerateArray().ToList();
        JsonElement Find(Guid id) => items.SingleOrDefault(i => i.GetProperty("id").GetString() == $"claim-{id}");

        Assert.False(Find(late).GetProperty("closed").GetBoolean());
        Assert.True(Find(validated).GetProperty("closed").GetBoolean());
        Assert.Equal(JsonValueKind.Undefined, Find(oldClosed).ValueKind);
    }

    [Fact]
    public async Task Deadlines_AreForbiddenToAnEmployee()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/admin/deadlines");
        request.Headers.Add(TestAuthHandler.RoleHeader, "user");
        Assert.Equal(HttpStatusCode.Forbidden, (await _client.SendAsync(request)).StatusCode);
    }
}
