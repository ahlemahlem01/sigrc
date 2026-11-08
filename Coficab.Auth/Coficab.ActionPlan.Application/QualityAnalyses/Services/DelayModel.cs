namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>What is known about a claim when its delay is estimated (all optional: the model copes with what is missing).</summary>
public sealed record ClaimEstimateContext(
    string? ClientId = null,
    string? ProductionLine = null,
    string? Shift = null,
    bool IsInternal = false,
    int? ProducedQuantity = null,
    int? DefectiveQuantity = null,
    string? AssigneeId = null,
    int? Month = null);

/// <summary>An answer of the machine-learning model. Only returned when the model passed its validation gate.</summary>
public sealed record DelayModelEstimate(double DaysP50, double DaysP80, int? TrainRows);

/// <summary>Asks the ML service for a delay. Never throws: null means "no usable answer", and the percentiles are kept.</summary>
public interface IDelayModelClient
{
    Task<DelayModelEstimate?> TryEstimateAsync(string? defectType, string? severity, ClaimEstimateContext context, CancellationToken cancellationToken = default);
}

/// <summary>Which estimate the application shows: the validated model when it answered sensibly, otherwise the empirical percentiles.</summary>
public static class ClaimEstimateSelection
{
    public const string MlMethod = "ml";

    public static ClaimResolutionEstimateDto? Choose(ClaimResolutionEstimateDto? percentiles, DelayModelEstimate? ml, string? defectType, string? severity)
    {
        if (ml is null || double.IsNaN(ml.DaysP50) || double.IsNaN(ml.DaysP80) || ml.DaysP50 < 0 || ml.DaysP80 < ml.DaysP50)
            return percentiles;

        return new ClaimResolutionEstimateDto
        {
            DaysP50 = Math.Round(ml.DaysP50, 1),
            DaysP80 = Math.Round(ml.DaysP80, 1),
            SampleSize = ml.TrainRows ?? 0,
            Method = MlMethod,
            DefectType = defectType,
            Severity = severity,
            SuggestedDeadlineUtc = null,
            IsReliable = true,
        };
    }
}
