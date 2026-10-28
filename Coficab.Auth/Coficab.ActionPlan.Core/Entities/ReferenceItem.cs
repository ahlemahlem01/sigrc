namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// One entry of a configurable reference list (multi-industry vocabulary).
/// <see cref="Value"/> is exactly what a claim stores, so renaming a label never rewrites history.
/// Never deleted: an unused entry is deactivated.
/// </summary>
public class ReferenceItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ListKey { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;

    /// <summary>Displayed name; empty means "use the default wording of the screens".</summary>
    public string? Label { get; set; }

    /// <summary>When set, this spelling was merged into that kept value (alias). Never deleted, only deactivated.</summary>
    public string? MergedInto { get; set; }

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}

public static class ReferenceListKeys
{
    /// <summary>Free vocabulary: each industry defines its own defect types.</summary>
    public const string DefectType = "defect-type";

    /// <summary>The four levels are fixed (LOW, MEDIUM, HIGH, CRITICAL, used by scoring and the ML model); their wording and visibility can be changed.</summary>
    public const string Severity = "severity";

    /// <summary>Customers, production lines and shifts: suggestions for the claim forms, typed freely on the claims.</summary>
    public const string Client = "client";
    public const string ProductionLine = "production-line";
    public const string Shift = "shift";

    /// <summary>Business domains of the action plans (quality, production, maintenance, HSE...): the multi-sector scope of the plan module.</summary>
    public const string Domain = "domain";

    public static readonly string[] All = { DefectType, Severity, Client, ProductionLine, Shift, Domain };
    /// <summary>The lists whose values are plain names (no wording, no fixed levels) and can be filled from the claims.</summary>
    public static readonly string[] Vocabulary = { DefectType, Client, ProductionLine, Shift };
    public static readonly string[] SeverityLevels = { "LOW", "MEDIUM", "HIGH", "CRITICAL" };
}

/// <summary>The business domains an action plan belongs to. The list is a reference list (domain): these seven are the ones every installation starts with.</summary>
public static class ActionPlanDomains
{
    public const string Quality = "QUALITY";
    public const string Default = Quality;     // plans born from a claim, an alert or an import without a domain are quality plans

    public static readonly (string Code, string Label)[] Standard =
    {
        (Quality, "Qualité"),
        ("PRODUCTION", "Production"),
        ("MAINTENANCE", "Maintenance"),
        ("HSE", "HSE"),
        ("LOGISTICS", "Logistique"),
        ("HR", "Ressources humaines"),
        ("CONTINUOUS_IMPROVEMENT", "Amélioration continue"),
    };
}
