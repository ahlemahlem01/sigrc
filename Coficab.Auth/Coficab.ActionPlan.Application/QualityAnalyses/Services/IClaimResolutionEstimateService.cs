namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

public sealed class ClaimResolutionEstimateDto
{
    public double DaysP50 { get; init; }
    public double DaysP80 { get; init; }
    public int SampleSize { get; init; }
    /// <summary>type_severity | severity | global | ml (validated machine-learning model)</summary>
    public string Method { get; init; } = "global";
    public string? DefectType { get; init; }
    public string? Severity { get; init; }
    public DateTime? SuggestedDeadlineUtc { get; init; }
    public bool IsReliable { get; init; }
}

public interface IClaimResolutionEstimateService
{
    /// <param name="context">When given, the validated machine-learning model is asked first; the percentiles remain the fallback.</param>
    Task<ClaimResolutionEstimateDto?> EstimateAsync(
        string? defectType,
        string? severity,
        CancellationToken cancellationToken = default,
        ClaimEstimateContext? context = null);
}
