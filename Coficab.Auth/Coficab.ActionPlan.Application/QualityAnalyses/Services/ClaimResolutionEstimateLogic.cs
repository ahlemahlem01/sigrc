namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Pure estimate math (PERCENTILE_CONT + cascade type_severity → severity → global).
/// Kept free of EF so unit tests can cover P50/P80 and fallback without a database.
/// </summary>
public static class ClaimResolutionEstimateLogic
{
    public const int MinSampleSize = 5;

    public sealed record SampleRow(string Defect, string Severity, double Days);

    /// <summary>
    /// Selects the best available sample set and builds P50/P80.
    /// Returns null when there are no samples at all.
    /// </summary>
    public static ClaimResolutionEstimateDto? EstimateFromSamples(
        IReadOnlyList<SampleRow> rows,
        string? defectType,
        string? severity)
    {
        if (rows.Count == 0)
            return null;

        var defect = Normalize(defectType);
        var sev = Normalize(severity)?.ToUpperInvariant();

        List<double> days;

        if (!string.IsNullOrEmpty(defect) && !string.IsNullOrEmpty(sev))
        {
            days = rows
                .Where(r => string.Equals(r.Defect, defect, StringComparison.OrdinalIgnoreCase)
                            && r.Severity == sev)
                .Select(r => r.Days)
                .ToList();
            if (days.Count >= MinSampleSize)
                return Build(days, "type_severity", defect, sev);
        }

        if (!string.IsNullOrEmpty(sev))
        {
            days = rows.Where(r => r.Severity == sev).Select(r => r.Days).ToList();
            if (days.Count >= MinSampleSize)
                return Build(days, "severity", defect, sev);
        }

        days = rows.Select(r => r.Days).ToList();
        if (days.Count == 0)
            return null;

        return Build(days, "global", defect, sev);
    }

    public static ClaimResolutionEstimateDto Build(
        List<double> days,
        string method,
        string? defect,
        string? sev)
    {
        days.Sort();
        var p50 = PercentileCont(days, 0.5);
        var p80 = PercentileCont(days, 0.8);
        if (p80 < p50) p80 = p50;

        p50 = Math.Round(p50, 1);
        p80 = Math.Round(p80, 1);

        return new ClaimResolutionEstimateDto
        {
            DaysP50 = p50,
            DaysP80 = p80,
            SampleSize = days.Count,
            Method = method,
            DefectType = defect,
            Severity = sev,
            SuggestedDeadlineUtc = null,
            IsReliable = days.Count >= MinSampleSize
        };
    }

    /// <summary>PERCENTILE_CONT-style linear interpolation on a sorted sample.</summary>
    public static double PercentileCont(IReadOnlyList<double> sorted, double p)
    {
        if (sorted.Count == 0) return double.NaN;
        if (sorted.Count == 1) return sorted[0];
        var pos = (sorted.Count - 1) * p;
        var lo = (int)Math.Floor(pos);
        var hi = (int)Math.Ceiling(pos);
        if (lo == hi) return sorted[lo];
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }

    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }
}
