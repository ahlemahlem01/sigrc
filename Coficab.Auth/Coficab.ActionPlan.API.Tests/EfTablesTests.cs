using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.ActionPlan.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Priority cause, D4 release and import batches now go through EF (no raw SQL), so they run here too.</summary>
public class EfTablesTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public EfTablesTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = "t", DefectType = "Soudure", ClientId = "A", Severity = "HIGH", LotNumber = "L",
            Description = "d", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
        return id;
    }

    [Fact]
    public async Task PriorityCause_NewChoice_SupersedesButKeepsThePrevious()
    {
        var claim = await AddClaim();
        var client = ClientAs("superadmin");

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/priority-cause/{claim}", new { text = "premiere" })).StatusCode);
        var second = await client.PostAsJsonAsync($"/api/priority-cause/{claim}", new { text = "seconde", source = "pareto" });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        using var doc = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        Assert.Equal("seconde", doc.RootElement.GetProperty("current").GetProperty("causeText").GetString());
        Assert.Equal(2, doc.RootElement.GetProperty("history").GetArrayLength());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        Assert.Equal(1, await db.PriorityCauses.CountAsync(p => p.ClaimId == claim && p.IsCurrent));
    }

    [Fact]
    public async Task D4Override_IsAdminOnly_NeedsAReason_AndReleasesTheChain()
    {
        var claim = await AddClaim();

        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PostAsJsonAsync($"/api/d4-chain/{claim}/override", new { reason = "motif suffisamment long" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ClientAs("superadmin").PostAsJsonAsync($"/api/d4-chain/{claim}/override", new { reason = "court" })).StatusCode);

        var ok = await ClientAs("superadmin").PostAsJsonAsync($"/api/d4-chain/{claim}/override", new { reason = "motif suffisamment long" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Contains("\"overridden\":true", await ok.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ArchivedImportBatch_IsExcludedFromHistory_ThenRestored()
    {
        var claim = await AddClaim();
        var batch = Guid.NewGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            db.ImportBatches.Add(new ImportBatch { Id = batch, FileName = "h.xlsx", CreatedBy = "u", ClaimCount = 1 });
            db.ImportBatchClaims.Add(new ImportBatchClaim { BatchId = batch, ClaimId = claim });
            await db.SaveChangesAsync();
        }

        var client = ClientAs("superadmin");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/history-import/batches/{batch}/archive", null)).StatusCode);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            Assert.Contains(claim, await HistoryScope.ExcludedClaimIdsAsync(db));
            Assert.True((await db.Claims.IgnoreQueryFilters().FirstAsync(c => c.Id == claim)).IsArchived);
        }

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/history-import/batches/{batch}/restore", null)).StatusCode);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            Assert.DoesNotContain(claim, await HistoryScope.ExcludedClaimIdsAsync(db));
            Assert.False((await db.Claims.IgnoreQueryFilters().FirstAsync(c => c.Id == claim)).IsArchived);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/history-import/batches/{Guid.NewGuid()}/archive", null)).StatusCode);
    }
}
