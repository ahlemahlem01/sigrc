using Coficab.ActionPlan.Application.Services;

namespace Coficab.ActionPlan.Application.Tests;

public class AnomalyZScoreCalculatorTests
{
    [Fact]
    public void Evaluate_DetectsSpike_AboveThreshold()
    {
        // Slight variance in baseline so std > 0; last week is a clear spike.
        var weeks = new double[] { 8, 10, 12, 10, 40 };
        var result = AnomalyZScoreCalculator.Evaluate(weeks);

        Assert.NotNull(result);
        Assert.True(result!.IsAnomalous);
        Assert.True(result.ZScore > AnomalyZScoreCalculator.DefaultThreshold);
        Assert.Equal(40, result.CurrentCount);
    }

    [Fact]
    public void Evaluate_StableSeries_NotAnomalous()
    {
        var weeks = new double[] { 10, 11, 9, 10, 10 };
        var result = AnomalyZScoreCalculator.Evaluate(weeks);

        Assert.NotNull(result);
        Assert.False(result!.IsAnomalous);
    }

    [Fact]
    public void Evaluate_TooShort_ReturnsNull()
    {
        var weeks = new double[] { 1, 2, 3 };
        Assert.Null(AnomalyZScoreCalculator.Evaluate(weeks));
    }

    [Fact]
    public void Evaluate_ZeroVariance_ReturnsNull()
    {
        var weeks = new double[] { 5, 5, 5, 5, 5 };
        Assert.Null(AnomalyZScoreCalculator.Evaluate(weeks));
    }

    [Fact]
    public void Evaluate_RespectsCustomThreshold()
    {
        var weeks = new double[] { 8, 10, 12, 10, 20 };
        var strict = AnomalyZScoreCalculator.Evaluate(weeks, threshold: 10);
        var loose = AnomalyZScoreCalculator.Evaluate(weeks, threshold: 0.1);

        Assert.NotNull(strict);
        Assert.NotNull(loose);
        Assert.False(strict!.IsAnomalous);
        Assert.True(loose!.IsAnomalous);
    }
}
