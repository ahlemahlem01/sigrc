namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// The content a saved report had before an edit. Append-only: an edited report never overwrites its past, it is kept here
/// so that every figure that was changed can be traced and the earlier state read again.
/// </summary>
public class SavedReportVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SavedReportId { get; set; }
    public int VersionNumber { get; set; }
    public string Title { get; set; } = string.Empty;
    public string CriteriaJson { get; set; } = "{}";
    public string ResultJson { get; set; } = "{}";
    public int ItemCount { get; set; }
    /// <summary>Who produced this version of the content and when.</summary>
    public DateTime SavedAt { get; set; } = DateTime.UtcNow;
    public string SavedBy { get; set; } = string.Empty;
    public string? SavedByName { get; set; }
    public string? Note { get; set; }
}

/// <summary>
/// One edited state of the customer 8D report of a claim (every text and figure of it). Append-only: the latest version is
/// the one the PDF is made from, the earlier ones stay readable.
/// </summary>
public class EightDReportVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClaimId { get; set; }
    public int VersionNumber { get; set; }
    public string ModelJson { get; set; } = "{}";
    public DateTime SavedAt { get; set; } = DateTime.UtcNow;
    public string SavedBy { get; set; } = string.Empty;
    public string? SavedByName { get; set; }
    public string? Note { get; set; }
}
