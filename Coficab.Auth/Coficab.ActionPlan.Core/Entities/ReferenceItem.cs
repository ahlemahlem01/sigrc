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

    public static readonly string[] All = { DefectType, Severity };
    public static readonly string[] SeverityLevels = { "LOW", "MEDIUM", "HIGH", "CRITICAL" };
}
