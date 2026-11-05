using Coficab.ActionPlan.Application.DTOs.Pareto;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.ActionPlan.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Tests;

public class ParetoServiceTests
{
    private static ActionPlanDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<ActionPlanDbContext>()
            .UseInMemoryDatabase("pareto-" + Guid.NewGuid())
            .Options;
        return new ActionPlanDbContext(options);
    }

    private static void Add(ActionPlanDbContext db, string defect, string? line, int count, bool archived = false)
    {
        for (var i = 0; i < count; i++)
        {
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(), Title = $"{defect}-{i}", DefectType = defect, ProductionLine = line, ClientId = "A",
                Severity = "HIGH", LotNumber = "L", Description = "d", StatusCode = "CLOTUREE",
                DetectionDate = new DateTime(2024, 5, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(i),
                IsArchived = archived,
            });
        }
        db.SaveChanges();
    }

    [Fact]
    public async Task ArchivedClaims_StillCount()
    {
        using var db = NewDb();
        Add(db, "Soudure", "WR-04", 4);
        Add(db, "Soudure", "WR-04", 3, archived: true);

        var items = await new ParetoService(db).GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType });

        Assert.Equal(7, Assert.Single(items).Count);
    }

    private static void AddClaim(ActionPlanDbContext db, string defect, string? line, string client, string? shift, string severity, DateTime when)
    {
        db.Claims.Add(new Claim
        {
            Id = Guid.NewGuid(), Title = defect, DefectType = defect, ProductionLine = line, ClientId = client, Shift = shift, Severity = severity,
            LotNumber = "L", Description = "d", StatusCode = "CLOTUREE", DetectionDate = when,
        });
    }

    [Fact]
    public async Task ManualAnalysis_ChoosesTheAxis_AndNarrowsByShiftSeverityClientLineAndDates()
    {
        using var db = NewDb();
        var jan = new DateTime(2025, 1, 10, 0, 0, 0, DateTimeKind.Utc);
        var jul = new DateTime(2025, 7, 10, 0, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 5; i++) AddClaim(db, "Soudure", "WR-04", "A", "Matin", "HIGH", jan);
        for (var i = 0; i < 3; i++) AddClaim(db, "Soudure", "WR-05", "B", "Soir", "LOW", jul);
        for (var i = 0; i < 2; i++) AddClaim(db, "Sertissage", "WR-04", "A", "Soir", "high", jul);      // the case of the severity does not matter
        db.SaveChanges();
        var service = new ParetoService(db);

        // by shift, every claim
        var byShift = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.Shift });
        Assert.Equal(new[] { ("Matin", 5), ("Soir", 5) }.OrderBy(x => x.Item1), byShift.Select(i => (i.Category, i.Count)).OrderBy(x => x.Category));

        // by line, only the evening shift
        var evening = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.ProductionLine, Shift = "Soir" });
        Assert.Equal(5, evening.Sum(i => i.Count));
        Assert.Contains(evening, i => i.Category == "WR-05" && i.Count == 3);

        // by defect type, only the high severity claims
        var high = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType, Severity = "High" });
        Assert.Equal(7, high.Sum(i => i.Count));
        Assert.DoesNotContain(high, i => i.Category == "Soudure" && i.Count == 8);

        // by client, one period and one line
        var window = await service.GetParetoAsync(new ParetoRequestDto
        {
            Dimension = ParetoDimension.ClientId, ProductionLine = "WR-04", DateFrom = new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Utc), DateTo = new DateTime(2025, 8, 1, 0, 0, 0, DateTimeKind.Utc),
        });
        var only = Assert.Single(window);
        Assert.Equal(("A", 2), (only.Category, only.Count));
    }

    [Fact]
    public async Task Employees_GetAggregatesOnly_SmallGroupsAreMerged()
    {
        using var db = NewDb();
        Add(db, "Soudure", "WR-04", 10);
        Add(db, "Sertissage", "ASM-01", 5);
        Add(db, "Marquage", "TEST-01", 2);   // below the minimum group size
        Add(db, "Étiquette", "TEST-01", 1);  // below the minimum group size

        var service = new ParetoService(db);
        var admin = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType });
        var employee = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType }, restrictSmallGroups: true);

        Assert.Equal(4, admin.Count);
        Assert.DoesNotContain(employee, i => i.Category is "Marquage" or "Étiquette");
        Assert.All(employee, i => Assert.True(i.Count >= ParetoService.MinGroupSize));
        Assert.Equal(18, employee.Sum(i => i.Count));
        Assert.Contains(employee, i => i.Category == "Autres" && i.Count == 3);
        Assert.Equal(100, employee.Last().CumulativePercentage, 1);
    }

    [Fact]
    public async Task Employees_GetNothing_WhenTheWholeSampleIsTiny()
    {
        using var db = NewDb();
        Add(db, "Soudure", "WR-04", 2);

        var items = await new ParetoService(db).GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType }, restrictSmallGroups: true);

        Assert.Empty(items);
    }

    [Fact]
    public async Task Suggestion_OnAnEmptyBase_SaysInsufficientData_NotAnError()
    {
        using var db = NewDb();

        var result = await new ParetoService(db).GetSuggestionAsync(new ParetoSuggestRequestDto { DefectType = "Soudure", ProductionLine = "WR-04" });

        Assert.False(result.HasData);
        Assert.True(result.InsufficientData);
        Assert.Equal(ParetoService.MinSampleForSuggestion, result.MinSample);
        Assert.False(string.IsNullOrWhiteSpace(result.Explanation));
    }

    [Fact]
    public async Task Suggestion_WithAThinHistory_IsInsufficient_ButStillReturnsTheItems()
    {
        using var db = NewDb();
        Add(db, "Soudure", "WR-04", 3);
        Add(db, "Soudure", "WR-05", 2);

        var result = await new ParetoService(db).GetSuggestionAsync(new ParetoSuggestRequestDto { DefectType = "Soudure" });

        Assert.False(result.HasData);
        Assert.True(result.InsufficientData);
        Assert.Equal(5, result.SampleSize);
        Assert.NotEmpty(result.Items);
    }

    private static void AddOthers(ActionPlanDbContext db)
    {
        // Other defects spread over three other lines: this is what "usual" looks like.
        Add(db, "Sertissage", "L1", 8);
        Add(db, "Sertissage", "L2", 8);
        Add(db, "Sertissage", "L3", 8);
    }

    [Fact]
    public async Task Suggestion_WithEnoughHistory_Recommends_AndIgnoresNonRenseigne()
    {
        using var db = NewDb();
        Add(db, "Soudure", null, 20);       // would be "Non renseigné" and the biggest bar
        Add(db, "Soudure", "WR-04", 12);
        Add(db, "Soudure", "WR-05", 2);
        AddOthers(db);

        var result = await new ParetoService(db).GetSuggestionAsync(new ParetoSuggestRequestDto { DefectType = "Soudure" });

        Assert.True(result.HasData);
        Assert.Equal("WR-04", result.TopCategory);
        Assert.Equal(14, result.SampleSize);
        Assert.InRange(result.ConfidenceScore, 0.01, 1.0); // an effect size, not an open-ended score
    }

    [Fact]
    public async Task Suggestion_UsesTheWholeHistory_NotJustTheLastSixMonths()
    {
        using var db = NewDb();
        Add(db, "Soudure", "WR-04", 10); // detected in 2024: far older than 180 days
        Add(db, "Soudure", "WR-05", 2);
        AddOthers(db);

        var result = await new ParetoService(db).GetSuggestionAsync(new ParetoSuggestRequestDto { DefectType = "Soudure" });

        Assert.True(result.HasData);
        Assert.Equal(12, result.SampleSize);
    }

    [Fact]
    public async Task Suggestion_SaysNoPattern_WhenTheAxisLooksLikeTheUsualDistribution()
    {
        using var db = NewDb();
        // Soudure is spread over the lines exactly like everything else.
        foreach (var line in new[] { "L1", "L2", "L3", "L4" })
        {
            Add(db, "Soudure", line, 4);
            Add(db, "Sertissage", line, 4);
        }

        var result = await new ParetoService(db).GetSuggestionAsync(new ParetoSuggestRequestDto { DefectType = "Soudure" });

        Assert.False(result.HasData);
        Assert.True(result.NoPattern);
        Assert.False(result.InsufficientData);
        Assert.NotEmpty(result.Items);
    }

    [Fact]
    public async Task Suggestion_RanksAxesByEffectSize_AndOnlyKeepsSignificantOnes()
    {
        using var db = NewDb();
        Add(db, "Soudure", "WR-04", 22);
        Add(db, "Soudure", "WR-05", 8);
        Add(db, "Soudure", "WR-02", 6);
        Add(db, "Débordement étain", "WR-04", 2);
        Add(db, "Sertissage", "L1", 10);
        Add(db, "Sertissage", "L2", 10);
        Add(db, "Marquage", "L3", 10);

        var result = await new ParetoService(db).GetSuggestionAsync(new ParetoSuggestRequestDto { DefectType = "Soudure", ProductionLine = "WR-04" });

        Assert.True(result.HasData);
        Assert.All(result.Candidates, c => Assert.True(c.Score > 0 && c.Score <= 1));
        // best first: the effect size band never increases down the list, ties go to the larger sample
        for (var i = 1; i < result.Candidates.Count; i++)
        {
            var (a, b) = (result.Candidates[i - 1], result.Candidates[i]);
            var (ba, bb) = (Math.Round(a.Score / 0.05), Math.Round(b.Score / 0.05));
            Assert.True(ba > bb || (ba == bb && a.SampleSize >= b.SampleSize));
        }
        Assert.Equal(result.Candidates[0].Mode, result.RecommendedMode);
        Assert.Equal(result.Candidates[0].Score, result.ConfidenceScore, 2);
    }

    [Fact]
    public async Task ImpactMeasure_RanksBySeverityAndQuantity_NotJustFrequency()
    {
        using var db = NewDb();
        for (var i = 0; i < 10; i++)
            db.Claims.Add(new Claim { Id = Guid.NewGuid(), Title = "f" + i, DefectType = "Frequent", Severity = "LOW", DefectiveQuantity = 2, ClientId = "A", LotNumber = "L", Description = "d", StatusCode = "CLOTUREE", DetectionDate = DateTime.UtcNow });
        for (var i = 0; i < 3; i++)
            db.Claims.Add(new Claim { Id = Guid.NewGuid(), Title = "g" + i, DefectType = "Grave", Severity = "CRITICAL", DefectiveQuantity = 40, ClientId = "A", LotNumber = "L", Description = "d", StatusCode = "CLOTUREE", DetectionDate = DateTime.UtcNow });
        db.SaveChanges();

        var service = new ParetoService(db);
        var byCount = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType });
        var byImpact = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType, Measure = "impact" });
        var employeeImpact = await service.GetParetoAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType, Measure = "impact" }, restrictSmallGroups: true);

        Assert.Equal("Frequent", byCount[0].Category);
        Assert.Equal("Grave", byImpact[0].Category);
        Assert.Equal(600, byImpact[0].Impact);               // 3 × 40 × 5
        Assert.Equal(100, byImpact.Last().CumulativePercentage, 1);
        Assert.Equal("Grave", employeeImpact[0].Category);   // same ranking for employees (both groups have >= 3 dossiers)
    }
}
