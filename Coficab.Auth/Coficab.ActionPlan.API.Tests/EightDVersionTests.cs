using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.DTOs.Claims;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Version history of the 8D dossier: append-only snapshots with what changed.</summary>
public class EightDVersionTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public EightDVersionTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _factory.SeedAsync(_ => Task.CompletedTask).GetAwaiter().GetResult();
    }

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim(string? createdBy = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = "Fil cassé", DefectType = "Coupure fil", ClientId = "ACME", Severity = "HIGH", LotNumber = "L1",
            Description = "Fil cassé en sortie de ligne", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow,
            CreatedById = createdBy ?? TestAuthHandler.TestUserId.ToString(),
        });
        await db.SaveChangesAsync();
        return id;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public void Diff_ListsOnlyTheFieldsThatChanged_WithTheirStep()
    {
        var before = new EightDSnapshot { ChampionName = "Alice", StatusCode = "IN_PROGRESS" };
        var after = new EightDSnapshot { ChampionName = "Alice", TeamMembers = "Bob", LotsChecked = 3, StatusCode = "IN_PROGRESS" };

        var changes = EightDVersioning.Diff(before, after);

        Assert.Equal(new[] { "teamMembers", "lotsChecked" }, changes.Select(c => c.Field).ToArray());
        Assert.Equal(1, changes.First(c => c.Field == "teamMembers").Step);
        Assert.Equal(6, changes.First(c => c.Field == "lotsChecked").Step);
        Assert.Empty(EightDVersioning.Diff(after, after));
    }

    [Fact]
    public void Diff_TreatsEmptyFalseAndMissingTheSame()
    {
        var a = new EightDSnapshot { ChampionName = null, ContainmentVerified = false };
        var b = new EightDSnapshot { ChampionName = "  ", ContainmentVerified = false };
        Assert.Empty(EightDVersioning.Diff(a, b));
    }

    [Fact]
    public async Task EachRealChange_AddsAVersion_AndANoOpSaveDoesNot()
    {
        var claim = await AddClaim();
        var client = ClientAs("superadmin");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/EightD/{claim}")).StatusCode); // creates the dossier

        await client.PutAsJsonAsync($"/api/EightD/{claim}", new { championName = "Alice", teamMembers = "Bob (qualité)" });
        await client.PutAsJsonAsync($"/api/EightD/{claim}", new { championName = "Alice", teamMembers = "Bob (qualité)" }); // same values: nothing new
        await client.PutAsJsonAsync($"/api/EightD/{claim}", new { championName = "Alice", teamMembers = "Bob et Carla" });

        var versions = (await Json(await client.GetAsync($"/api/EightD/{claim}/versions"))).EnumerateArray().ToList();

        Assert.Equal(3, versions.Count); // baseline + 2 real changes
        Assert.Equal(new[] { 3, 2, 1 }, versions.Select(v => v.GetProperty("version").GetInt32()).ToArray()); // newest first
        Assert.Equal("baseline", versions[2].GetProperty("eventType").GetString());
        Assert.True(versions[0].GetProperty("isCurrent").GetBoolean());
        Assert.Contains(versions[1].GetProperty("changedFields").EnumerateArray(), f => f.GetString() == "championName");
        Assert.Equal(new[] { "teamMembers" }, versions[0].GetProperty("changedFields").EnumerateArray().Select(f => f.GetString()).Where(f => f == "teamMembers").ToArray());
    }

    [Fact]
    public async Task VersionDetail_ShowsBeforeAndAfter()
    {
        var claim = await AddClaim();
        var client = ClientAs("superadmin");
        await client.GetAsync($"/api/EightD/{claim}");
        await client.PutAsJsonAsync($"/api/EightD/{claim}", new { championName = "Alice", teamMembers = "Bob" });
        await client.PutAsJsonAsync($"/api/EightD/{claim}", new { teamMembers = "Bob et Carla" });

        var detail = await Json(await client.GetAsync($"/api/EightD/{claim}/versions/3"));
        var change = detail.GetProperty("changes").EnumerateArray().Single(c => c.GetProperty("field").GetString() == "teamMembers");

        Assert.Equal("Bob", change.GetProperty("before").GetString());
        Assert.Equal("Bob et Carla", change.GetProperty("after").GetString());
        Assert.Equal(1, change.GetProperty("step").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/EightD/{claim}/versions/99")).StatusCode);
    }

    [Fact]
    public async Task ADossierWithoutHistory_GetsItsCurrentStateAsFirstVersion()
    {
        var claim = await AddClaim();
        var client = ClientAs("superadmin");
        await client.GetAsync($"/api/EightD/{claim}"); // dossier exists, never saved

        var versions = (await Json(await client.GetAsync($"/api/EightD/{claim}/versions"))).EnumerateArray().ToList();
        Assert.Single(versions);
        Assert.Equal("baseline", versions[0].GetProperty("eventType").GetString());

        // Asking again does not add another one.
        Assert.Single((await Json(await client.GetAsync($"/api/EightD/{claim}/versions"))).EnumerateArray());
    }

    [Fact]
    public async Task Employee_SeesOnlyTheHistoryOfHisOwnClaims()
    {
        var others = await AddClaim("someone-else");
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").GetAsync($"/api/EightD/{others}/versions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").GetAsync($"/api/EightD/{others}/versions/1")).StatusCode);

        var mine = await AddClaim();
        await ClientAs("superadmin").GetAsync($"/api/EightD/{mine}");
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("user").GetAsync($"/api/EightD/{mine}/versions")).StatusCode);
    }

    [Fact]
    public async Task VersionsAreNeverRemoved_TheyOnlyGrow()
    {
        var claim = await AddClaim();
        var client = ClientAs("superadmin");
        await client.GetAsync($"/api/EightD/{claim}");
        await client.PutAsJsonAsync($"/api/EightD/{claim}", new { championName = "Alice" });
        await client.PutAsJsonAsync($"/api/EightD/{claim}", new { championName = "Bruno" });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var stored = await db.EightDVersions.Where(v => v.ClaimId == claim).OrderBy(v => v.VersionNumber).ToListAsync();

        Assert.Equal(new[] { 1, 2, 3 }, stored.Select(v => v.VersionNumber).ToArray());
        Assert.Equal("Alice", EightDVersioning.Deserialize(stored[1].SnapshotJson).ChampionName); // the old value is still readable
        Assert.Equal("Bruno", EightDVersioning.Deserialize(stored[2].SnapshotJson).ChampionName);
    }
}
