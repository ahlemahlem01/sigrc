namespace Coficab.ActionPlan.Application.Services;

/// <summary>
/// Pure z-score anomaly math (last week vs mean/std of prior N weeks).
/// </summary>
public static class AnomalyZScoreCalculator
{
    public const double DefaultThreshold = 2.5;
    public const int DefaultBaselineWeeks = 4;

    public sealed record Result(
        double ZScore,
        double BaselineMean,
        double BaselineStd,
        double CurrentCount,
        bool IsAnomalous);

    /// <summary>
    /// Evaluates the latest week against the preceding <paramref name="baselineWeeks"/> weeks.
    /// Returns null when the series is too short or std is ~0 (no signal).
    /// </summary>
    public static Result? Evaluate(
        IReadOnlyList<double> weeklyCounts,
        int baselineWeeks = DefaultBaselineWeeks,
        double threshold = DefaultThreshold)
    {
        if (weeklyCounts.Count < baselineWeeks + 1)
            return null;

        var currentIdx = weeklyCounts.Count - 1;
        var current = weeklyCounts[currentIdx];
        var baseline = weeklyCounts
            .Skip(currentIdx - baselineWeeks)
            .Take(baselineWeeks)
            .ToList();

        if (baseline.Count < baselineWeeks)
            return null;

        var mean = baseline.Average();
        var variance = baseline.Sum(v => (v - mean) * (v - mean)) / baseline.Count;
        var std = Math.Sqrt(variance);
        if (std < 1e-9)
            return null;

        var z = (current - mean) / std;
        return new Result(
            Math.Round(z, 4),
            Math.Round(mean, 2),
            Math.Round(std, 4),
            current,
            z > threshold);
    }
}
