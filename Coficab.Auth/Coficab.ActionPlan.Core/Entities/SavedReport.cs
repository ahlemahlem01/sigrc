namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// A report an administrator chose to keep: the criteria it was generated with and the figures of that day (a snapshot,
/// so it can be reopened later as it was). Never deleted: an archived report only leaves the list.
/// </summary>
public class SavedReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>claims | capa-actions</summary>
    public string Kind { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string CriteriaJson { get; set; } = "{}";
    public string ResultJson { get; set; } = "{}";
    public int ItemCount { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }
}
