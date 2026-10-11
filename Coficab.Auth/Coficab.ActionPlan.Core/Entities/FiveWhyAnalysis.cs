namespace Coficab.ActionPlan.Core.Entities;

public class FiveWhyAnalysis
{
    public Guid Id { get; set; }
    public Guid ClaimId { get; set; }
    public string ProblemStatement { get; set; } = string.Empty;
    public string? RootCause { get; set; }
    public string? RootCauseOccurrence { get; set; }
    public string? RootCauseDetection { get; set; }

    public string StatusCode { get; set; } = "DRAFT";
    public bool IsValidated { get; set; }
    public string? ValidatedBy { get; set; }
    public DateTime? ValidatedAt { get; set; }

    // Audit Trail
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime? LastModifiedAt { get; set; }
    public string? LastModifiedBy { get; set; }

    // Soft Delete / Archivage
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }
    public string? ArchiveReason { get; set; }

    public List<FiveWhyStep> Steps { get; set; } = new();
}