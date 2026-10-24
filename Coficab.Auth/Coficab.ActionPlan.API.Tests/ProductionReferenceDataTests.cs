using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The production master data (inspection defect codes, direct customer sites) is added to the reference lists without touching anything else.</summary>
public class ProductionReferenceDataTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public ProductionReferenceDataTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _factory.SeedAsync(_ => Task.CompletedTask).GetAwaiter().GetResult();
    }

    private async Task<int> EnsureAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        return await ProductionReferenceData.EnsureAsync(db, CancellationToken.None);
    }

    [Fact]
    public async Task Ensure_AddsTheMissingEntries_ThenDoesNothing()
    {
        await EnsureAsync();
        Assert.Equal(0, await EnsureAsync());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var defects = await db.ReferenceItems.AsNoTracking().Where(r => r.ListKey == ReferenceListKeys.DefectType).ToListAsync();
        foreach (var code in new[] { "CUT_INSULATION", "COPPER_BLOOMING", "MARKING_DEFECT", "SPOOL_DAMAGE", "COLOR_MISMATCH" })
            Assert.Contains(defects, d => d.Value == code && d.IsActive && !string.IsNullOrWhiteSpace(d.Label));
        Assert.Equal("Coupure / Entaille sur gaine", defects.Single(d => d.Value == "CUT_INSULATION").Label);

        var clients = (await db.ReferenceItems.AsNoTracking().Where(r => r.ListKey == ReferenceListKeys.Client).ToListAsync()).Select(c => c.Value).ToList();
        foreach (var site in new[] { "COFAT-MATEUR", "COFAT-TUNIS", "LEONI-MATEUR", "LEONI-MESSADINE", "YAZAKI-GAFSA", "APTIV-MONASTIR", "DRAXLMAIER-SOUSSE", "DRAXLMAIER-EL-FEJJA", "KROMBERG-BEJA" })
            Assert.Contains(site, clients);
    }

    [Fact]
    public async Task Ensure_NeverChangesAnExistingEntry_OrAnyClaim()
    {
        var claimId = Guid.NewGuid();
        await _factory.SeedAsync(async db =>
        {
            db.ReferenceItems.RemoveRange(db.ReferenceItems.Where(r => r.ListKey == ReferenceListKeys.Client && r.Value == "COFAT-TUNIS"));
            db.ReferenceItems.Add(new ReferenceItem { ListKey = ReferenceListKeys.Client, Value = "COFAT-TUNIS", Label = null, IsActive = false, SortOrder = 77, UpdatedBy = "administrator" });
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "Soudure défectueuse sur faisceau", ClientId = "RENAULT-SAN", DefectType = "Soudure défectueuse", Severity = "HIGH",
                LotNumber = "L1", Description = "dossier existant", StatusCode = "CLOTUREE", CreatedAt = DateTime.UtcNow.AddDays(-30),
            });
            await Task.CompletedTask;
        });

        await EnsureAsync();

        using var scope = _factory.Services.CreateScope();
        var db2 = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var item = await db2.ReferenceItems.AsNoTracking().SingleAsync(r => r.ListKey == ReferenceListKeys.Client && r.Value == "COFAT-TUNIS");
        Assert.False(item.IsActive);
        Assert.Equal(77, item.SortOrder);
        Assert.Equal("administrator", item.UpdatedBy);

        var claim = await db2.Claims.AsNoTracking().SingleAsync(c => c.Id == claimId);
        Assert.Equal("Soudure défectueuse", claim.DefectType);
        Assert.Equal("RENAULT-SAN", claim.ClientId);
        Assert.Equal("CLOTUREE", claim.StatusCode);
    }

    [Fact]
    public async Task ADefectCode_IsShownWithItsLabel_InReportsAndScreens()
    {
        await EnsureAsync();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var resolver = await DefectTypeResolver.LoadAsync(db, CancellationToken.None);

        Assert.Equal("Coupure / Entaille sur gaine", resolver.DisplayName("CUT_INSULATION"));
        Assert.Equal("Coupure / Entaille sur gaine", resolver.DisplayName("cut insulation")); // same words typed differently
        Assert.Equal("Soudure défectueuse", resolver.DisplayName("Soudure défectueuse")); // a name without label stays as is
        Assert.Equal("CUT_INSULATION", resolver.Resolve("cut_insulation"));
    }
}
