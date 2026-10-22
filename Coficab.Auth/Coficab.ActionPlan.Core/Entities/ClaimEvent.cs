namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// One thing that happened to a claim (created, edited, assigned, deadline set, analysis started, archived, 5 Why
/// submitted / validated / rejected). Append-only: it feeds the audit log and is never edited or deleted.
/// </summary>
public class ClaimEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClaimId { get; set; }
    /// <summary>claim_created | claim_updated | claim_assigned | claim_unassigned | claim_deadline_set | claim_analysis_started | claim_archived | claim_restored | fivewhy_submitted | fivewhy_validated | fivewhy_rejected</summary>
    public string ActionType { get; set; } = string.Empty;
    public string ActorId { get; set; } = string.Empty;
    public string? Detail { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
