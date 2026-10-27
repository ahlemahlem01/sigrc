namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Demonstration mode of the image proposal (ComputerVision:Mode = "demo"): no image model is called, the proposal is a fixed example
/// chosen from the file name, so the proposal card and the correction loop can be shown without the image service. The answer is
/// always flagged as a demonstration and the interface says so.
/// </summary>
public static class CvDemoPrediction
{
    /// <summary>A file name containing "copper", "cuivre" or "bloom" gives an unsure proposal (to show the warning and the correction); any other gives a confident one.</summary>
    public static (string DefectType, double Confidence) For(string? fileName)
    {
        var name = (fileName ?? string.Empty).ToLowerInvariant();
        return name.Contains("copper") || name.Contains("cuivre") || name.Contains("bloom")
            ? ("COPPER_BROKEN", 0.58)
            : ("CUT_INSULATION", 0.93);
    }
}
