namespace Coficab.ActionPlan.Core.Entities;

public enum IshikawaCategory
{
    Manpower,
    Machine,
    Material,
    Method,
    Milieu,
    Measurement
}

public class IshikawaCause
{
    public Guid Id { get; set; }
    public Guid ClaimId { get; set; }
    public IshikawaCategory Category { get; set; }
    public string CauseDescription { get; set; } = string.Empty;
    public bool IsRootCause { get; set; }

    // Prospective Pareto: the analyst's own estimate of how critical the cause is (1 to 10 each), independent of any history.
    // Severity if it happens, Occurrence (how often), Detection (how hard it is to see before shipping). All three or none.
    public int? RiskSeverity { get; set; }
    public int? RiskOccurrence { get; set; }
    public int? RiskDetection { get; set; }

    // Audit Trail
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;

    // Soft Delete / Archivage
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }
    public string? ArchiveReason { get; set; }
}