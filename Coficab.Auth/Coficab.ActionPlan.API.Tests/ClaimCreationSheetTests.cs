using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>
/// After creating a claim, the creator confirms a sheet: they may correct any field and choose the deadline (default: creation + P80).
/// Only the creator, only once, and everything is traced with the old and the new value.
/// </summary>
public class ClaimCreationSheetTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ClaimCreationSheetTests(ActionPlanApiFactory factory) => _factory = factory;

    private const string Base = "/api/QualityAnalysis/claims";
    private static readonly string Creator = TestAuthHandler.TestUserId.ToString();
    private const string Reason = "Le client attend le lot avant la fin de semaine.";

    private HttpClient As(string role, string? userId = null)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (userId != null) client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, userId);
        return client;
    }

    private static DateTime Day(int fromToday) => DateTime.UtcNow.Date.AddDays(fromToday);

    private async Task<Guid> SeedAsync(string status = "OUVERTE", double? p80 = 4.2, DateTime? deadline = null)
    {
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = id, Title = "fiche de création", DefectType = "Soudure", ClientId = "A", Severity = "LOW", LotNumber = "L1", Description = "d",
                StatusCode = status, DetectionDate = DateTime.UtcNow, CreatedById = Creator, CreatedAt = DateTime.UtcNow,
                EstimatedDaysP80 = p80, Deadline = deadline,
            });
            return Task.CompletedTask;
        });
        return id;
    }

    private T Query<T>(Func<ActionPlanDbContext, T> read)
    {
        using var scope = _factory.Services.CreateScope();
        return read(scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>());
    }

    private static async Task<string?> CodeOf(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("code", out var c) ? c.GetString() : null;

    [Fact]
    public void TheSuggestedDeadline_IsCreationDayPlusP80RoundedUp()
    {
        var created = new DateTime(2026, 11, 3, 15, 30, 0, DateTimeKind.Utc);
        Assert.Equal(new DateTime(2026, 11, 8), Core(created, 4.2));
        Assert.Equal(new DateTime(2026, 11, 7), Core(created, 4.0));
        Assert.Null(ClaimCreationSheetRulesAlias.Suggested(created, null));
    }

    private static DateTime? Core(DateTime created, double p80) => ClaimCreationSheetRulesAlias.Suggested(created, p80);

    [Fact]
    public async Task ConfirmingWithoutTouchingAnything_AppliesTheSuggestedDate_AndClosesTheSheet()
    {
        var id = await SeedAsync();
        var r = await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(Day(5), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        Assert.Contains(Query(db => db.ClaimEvents.Where(e => e.ClaimId == id).Select(e => e.ActionType).ToList()), a => a == "claim_creation_validated");
        Assert.Contains(Query(db => db.ClaimEvents.Where(e => e.ClaimId == id).Select(e => e.ActionType).ToList()), a => a == "claim_deadline_set");
        Assert.Empty(Query(db => db.ClaimEvents.Where(e => e.ClaimId == id && e.ActionType == "claim_creation_edited").ToList()));
    }

    [Fact]
    public async Task TheCreator_CanCorrectAnyField_AndEachChangeKeepsOldAndNewValue()
    {
        var id = await SeedAsync();
        var r = await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { changes = new { severity = "HIGH", lotNumber = "L2", description = "nouvelle description" } });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var claim = Query(db => db.Claims.Single(c => c.Id == id));
        Assert.Equal("HIGH", claim.Severity);
        Assert.Equal("L2", claim.LotNumber);
        Assert.Equal("nouvelle description", claim.Description);
        var ev = Query(db => db.ClaimEvents.Single(e => e.ClaimId == id && e.ActionType == "claim_creation_edited"));
        Assert.Contains("severity: LOW → HIGH", ev.Detail);
        Assert.Contains("lot: L1 → L2", ev.Detail);
        Assert.Contains("description: d → nouvelle description", ev.Detail);
    }

    [Fact]
    public async Task ADateOtherThanTheSuggestion_IsAccepted_WithOrWithoutAReason_AndIsTraced()
    {
        var withoutReason = await SeedAsync();
        var ok0 = await As("user").PostAsJsonAsync($"{Base}/{withoutReason}/creation-sheet/validate", new { deadline = Day(12) });
        Assert.Equal(HttpStatusCode.OK, ok0.StatusCode);
        Assert.Equal(Day(12), Query(db => db.Claims.Single(c => c.Id == withoutReason).Deadline));
        var ev0 = Query(db => db.ClaimEvents.Single(e => e.ClaimId == withoutReason && e.ActionType == "claim_deadline_changed"));
        Assert.Contains(Day(12).ToString("yyyy-MM-dd"), ev0.Detail);
        Assert.DoesNotContain("·  ", ev0.Detail);

        var id = await SeedAsync();
        var ok = await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { deadline = Day(12), deadlineReason = Reason });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(Day(12), Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        var ev = Query(db => db.ClaimEvents.Single(e => e.ClaimId == id && e.ActionType == "claim_deadline_changed"));
        Assert.Contains(Day(12).ToString("yyyy-MM-dd"), ev.Detail);
        Assert.Contains("Le client attend", ev.Detail);
    }

    [Fact]
    public async Task ATooLongReason_IsRefused_AndNothingChanges()
    {
        var id = await SeedAsync();
        var r = await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { deadline = Day(12), deadlineReason = new string('x', 501) });
        Assert.Equal("reasonTooLong", await CodeOf(r));
        Assert.Null(Query(db => db.Claims.Single(c => c.Id == id).Deadline));
        Assert.Empty(Query(db => db.ClaimEvents.Where(e => e.ClaimId == id && e.ActionType == "claim_creation_validated").ToList()));
    }

    [Theory]
    [InlineData(-3, "newDateInPast")]
    [InlineData(400, "tooFar")]
    public async Task ADateOutOfRange_IsRefused_AndNothingChanges(int fromToday, string code)
    {
        var id = await SeedAsync();
        var r = await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { changes = new { severity = "HIGH" }, deadline = Day(fromToday), deadlineReason = Reason });
        Assert.Equal(code, await CodeOf(r));
        Assert.Equal("LOW", Query(db => db.Claims.Single(c => c.Id == id).Severity));
        Assert.Empty(Query(db => db.ClaimEvents.Where(e => e.ClaimId == id).ToList()));
    }

    [Fact]
    public async Task OnlyTheCreator_CanConfirm()
    {
        var id = await SeedAsync();
        var r = await As("superadmin", Guid.NewGuid().ToString()).PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { });
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
        Assert.Null(Query(db => db.Claims.Single(c => c.Id == id).Deadline));
    }

    [Fact]
    public async Task ASheetCanBeConfirmedOnlyOnce()
    {
        var id = await SeedAsync();
        Assert.Equal(HttpStatusCode.OK, (await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { })).StatusCode);
        var again = await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { changes = new { severity = "HIGH" } });
        Assert.Equal("alreadyValidated", await CodeOf(again));
        Assert.Equal("LOW", Query(db => db.Claims.Single(c => c.Id == id).Severity));
    }

    [Fact]
    public async Task AClosedClaim_CannotBeConfirmed()
    {
        var id = await SeedAsync("CLOTUREE");
        Assert.Equal("notOpen", await CodeOf(await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { })));
    }

    [Fact]
    public async Task TheSheet_IsReadOnlyForOthers_AndAfterConfirmation()
    {
        var id = await SeedAsync();
        var asCreator = await (await As("user").GetAsync($"{Base}/{id}/creation-sheet")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(asCreator.GetProperty("canEdit").GetBoolean());
        Assert.False(asCreator.GetProperty("validated").GetBoolean());

        var asOther = await (await As("superadmin", Guid.NewGuid().ToString()).GetAsync($"{Base}/{id}/creation-sheet")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(asOther.GetProperty("canEdit").GetBoolean());

        await As("user").PostAsJsonAsync($"{Base}/{id}/creation-sheet/validate", new { });
        var after = await (await As("user").GetAsync($"{Base}/{id}/creation-sheet")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(after.GetProperty("validated").GetBoolean());
        Assert.False(after.GetProperty("canEdit").GetBoolean());
        Assert.True(after.GetProperty("history").GetArrayLength() >= 2);
    }

    [Fact]
    public async Task TheDirectDeadlineCall_IsForAdministratorsOnly()
    {
        var id = await SeedAsync();
        var r = await As("user").PatchAsJsonAsync($"{Base}/{id}/deadline", new { deadline = Day(7) });
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
    }
}

internal static class ClaimCreationSheetRulesAlias
{
    public static DateTime? Suggested(DateTime created, double? p80) =>
        Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims.ClaimCreationSheetRules.SuggestedDeadline(created, p80);
}
