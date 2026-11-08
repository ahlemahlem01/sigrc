using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>Which type of plan the CAPA of the 5 Why becomes: PA (improvement), PAC (corrective) or PAP (preventive).</summary>
public static class CapaPlanTypeRules
{
    /// <summary>Corrective, preventive or improvement: 2, 3 or 1. Anything else is not a choice.</summary>
    public static bool IsChoice(int? requested) => requested is 1 or 2 or 3;

    /// <summary>
    /// Whether the person still has to choose: the choice is required (to generate and to create), except for an internal (workshop) problem,
    /// which is always closed with a corrective plan.
    /// </summary>
    public static bool ChoiceMissing(int? requested, bool internalClaim) => !internalClaim && !IsChoice(requested);

    /// <summary>The type of the plan: the person's choice; an internal claim is always a corrective plan (PAC).</summary>
    public static ActionPlanType Resolve(int? requested, bool internalClaim)
    {
        if (internalClaim) return ActionPlanType.PAC;
        return requested switch
        {
            1 => ActionPlanType.PA,
            3 => ActionPlanType.PAP,
            _ => ActionPlanType.PAC,
        };
    }

    /// <summary>The nature written on every action of the plan: it follows the type of the plan.</summary>
    public static string KindOf(ActionPlanType type) => type switch
    {
        ActionPlanType.PAP => "PREVENTIVE",
        ActionPlanType.PA => "IMPROVEMENT",
        _ => "CORRECTIVE",
    };

    /// <summary>The title an action gets when the person left it empty.</summary>
    public static string DefaultActionTitle(string? kind) => (kind ?? string.Empty).Trim().ToUpperInvariant() switch
    {
        "PREVENTIVE" => "Action préventive",
        "IMPROVEMENT" => "Action d’amélioration",
        _ => "Action corrective",
    };

    public static string NormalizeBranch(string? branch, int index) =>
        string.Equals(branch?.Trim(), "DETECTION", StringComparison.OrdinalIgnoreCase) ? "DETECTION"
        : string.Equals(branch?.Trim(), "OCCURRENCE", StringComparison.OrdinalIgnoreCase) ? "OCCURRENCE"
        : index == 1 ? "DETECTION" : "OCCURRENCE";
}
