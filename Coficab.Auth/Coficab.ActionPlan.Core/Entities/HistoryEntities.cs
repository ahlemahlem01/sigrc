namespace Coficab.ActionPlan.Core.Entities;

/// <summary>One import of historical dossiers (Excel/CSV). Archived as a whole, never deleted.</summary>
public class ImportBatch
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Kind { get; set; } = "claims-history";
    public string FileName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public int ClaimCount { get; set; }
    public int CauseCount { get; set; }
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
}

/// <summary>Claims that came with an import batch (so the batch can be archived/restored as a whole).</summary>
public class ImportBatchClaim
{
    public Guid BatchId { get; set; }
    public Guid ClaimId { get; set; }
}

/// <summary>The cause an analyst decided to dig into. Append-only: a newer choice supersedes the previous one.</summary>
public class PriorityCause
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClaimId { get; set; }
    public string? Category { get; set; }
    public string CauseText { get; set; } = string.Empty;
    public string Source { get; set; } = "manual";
    public string SelectedById { get; set; } = string.Empty;
    public string? SelectedByName { get; set; }
    public DateTime SelectedAt { get; set; } = DateTime.UtcNow;
    public bool IsCurrent { get; set; }
    public DateTime? SupersededAt { get; set; }
}

/// <summary>An admin's release of the D4 chain rule for one dossier, with the reason. Never deleted.</summary>
public class D4Override
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClaimId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string ByUserId { get; set; } = string.Empty;
    public string? ByUserName { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
}
