using Coficab.ActionPlan.Application.ReferenceLists;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Active learning for the image model: a claim is flagged as a learning signal when the operator ends up with another defect
/// code than the one proposed, or when the proposal was not confident enough to be trusted. Those claims are the first ones to
/// label and feed back when the model is retrained.
/// </summary>
public static class CvFeedback
{
    /// <summary>Below this confidence a proposal is only a hint: the claim is logged for learning even when the operator accepted it.</summary>
    public const double ConfidenceThreshold = 0.70;

    public static bool ShouldLog(string? predicted, double? confidence, string chosen, DefectTypeResolver resolver)
    {
        if (string.IsNullOrWhiteSpace(predicted)) return false;
        var differs = !string.Equals(resolver.Resolve(predicted.Trim()), chosen, StringComparison.Ordinal);
        return differs || (confidence ?? 0) < ConfidenceThreshold;
    }
}
