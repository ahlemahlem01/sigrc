namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

public sealed class ClaimResolutionEstimateDto
{
    public double DaysP50 { get; init; }
    public double DaysP80 { get; init; }
    public int SampleSize { get; init; }
    /// <summary>type_severity | severity | global</summary>
    public string Method { get; init; } = "global";
    public string? DefectType { get; init; }
    public string? Severity { get; init; }
    public DateTime? SuggestedDeadlineUtc { get; init; }
    public bool IsReliable { get; init; }
}

public interface IClaimResolutionEstimateService
{
    Task<ClaimResolutionEstimateDto?> EstimateAsync(
        string? defectType,
        string? severity,
        CancellationToken cancellationToken = default);
}
