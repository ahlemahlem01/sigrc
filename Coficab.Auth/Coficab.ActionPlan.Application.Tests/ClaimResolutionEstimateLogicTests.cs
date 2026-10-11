using Coficab.ActionPlan.Application.QualityAnalyses.Services;

namespace Coficab.ActionPlan.Application.Tests;

public class ClaimResolutionEstimateLogicTests
{
    [Fact]
    public void PercentileCont_OddSample_ReturnsMedian()
    {
        var sorted = new List<double> { 1, 2, 3, 4, 5 };
        Assert.Equal(3.0, ClaimResolutionEstimateLogic.PercentileCont(sorted, 0.5));
    }

    [Fact]
    public void PercentileCont_EvenSample_Interpolates()
    {
        var sorted = new List<double> { 10, 20, 30, 40 };
        // pos = 3 * 0.5 = 1.5 → 20 + (30-20)*0.5 = 25
        Assert.Equal(25.0, ClaimResolutionEstimateLogic.PercentileCont(sorted, 0.5));
    }

    [Fact]
    public void PercentileCont_P80_OnFivePoints()
    {
        var sorted = new List<double> { 5, 10, 15, 20, 25 };
        // pos = 4 * 0.8 = 3.2 → 20 + (25-20)*0.2 = 21
        Assert.Equal(21.0, ClaimResolutionEstimateLogic.PercentileCont(sorted, 0.8), 5);
    }

    [Fact]
    public void Estimate_PrefersTypeSeverity_WhenEnoughSamples()
    {
        var rows = BuildRows("Soudure", "HIGH", 5, baseDays: 10)
            .Concat(BuildRows("Soudure", "LOW", 5, baseDays: 3))
            .Concat(BuildRows("Autre", "HIGH", 5, baseDays: 40))
            .ToList();

        var result = ClaimResolutionEstimateLogic.EstimateFromSamples(rows, "Soudure", "HIGH");

        Assert.NotNull(result);
        Assert.Equal("type_severity", result!.Method);
        Assert.True(result.IsReliable);
        Assert.Equal(5, result.SampleSize);
        Assert.True(result.DaysP80 >= result.DaysP50);
    }

    [Fact]
    public void Estimate_FallsBackToSeverity_WhenTypeSeveritySparse()
    {
        // Only 2 rows for exact type+severity (< MinSampleSize=5), but 5+ for severity.
        var rows = new List<ClaimResolutionEstimateLogic.SampleRow>
        {
            new("Soudure", "HIGH", 12),
            new("Soudure", "HIGH", 14),
            new("Autre", "HIGH", 10),
            new("Autre", "HIGH", 11),
            new("Autre", "HIGH", 13),
            new("Autre", "HIGH", 15),
            new("Autre", "HIGH", 16),
        };

        var result = ClaimResolutionEstimateLogic.EstimateFromSamples(rows, "Soudure", "HIGH");

        Assert.NotNull(result);
        Assert.Equal("severity", result!.Method);
        Assert.True(result.SampleSize >= ClaimResolutionEstimateLogic.MinSampleSize);
    }

    [Fact]
    public void Estimate_FallsBackToGlobal_WhenSeveritySparse()
    {
        var rows = new List<ClaimResolutionEstimateLogic.SampleRow>
        {
            new("A", "HIGH", 8),
            new("B", "HIGH", 9),
            new("C", "LOW", 20),
            new("D", "LOW", 22),
            new("E", "MEDIUM", 15),
        };

        var result = ClaimResolutionEstimateLogic.EstimateFromSamples(rows, "A", "CRITICAL");

        Assert.NotNull(result);
        Assert.Equal("global", result!.Method);
        Assert.Equal(5, result.SampleSize);
        // With < MinSampleSize for global reliability gate: still IsReliable when count >= 5
        Assert.True(result.IsReliable);
    }

    [Fact]
    public void Estimate_ReturnsNull_WhenNoSamples()
    {
        var result = ClaimResolutionEstimateLogic.EstimateFromSamples(
            Array.Empty<ClaimResolutionEstimateLogic.SampleRow>(),
            "X",
            "HIGH");
        Assert.Null(result);
    }

    private static List<ClaimResolutionEstimateLogic.SampleRow> BuildRows(
        string defect, string severity, int count, double baseDays)
    {
        return Enumerable.Range(0, count)
            .Select(i => new ClaimResolutionEstimateLogic.SampleRow(defect, severity, baseDays + i))
            .ToList();
    }
}
