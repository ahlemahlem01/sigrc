namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// Rapport employé lié à une alerte. Un rejet change le statut, ne supprime pas la ligne.
/// </summary>
public class AlertReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AlertId { get; set; }
    public Alert? Alert { get; set; }

    public string AuthorId { get; set; } = string.Empty;
    public string? AuthorName { get; set; }
    public string Content { get; set; } = string.Empty;

    /// <summary>Submitted | Validated | Rejected</summary>
    public string Status { get; set; } = "Submitted";

    public string? ReviewNote { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
