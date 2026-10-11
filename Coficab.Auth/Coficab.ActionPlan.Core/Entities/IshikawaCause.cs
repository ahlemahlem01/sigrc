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

    // Audit Trail
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;

    // Soft Delete / Archivage
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }
    public string? ArchiveReason { get; set; }
}