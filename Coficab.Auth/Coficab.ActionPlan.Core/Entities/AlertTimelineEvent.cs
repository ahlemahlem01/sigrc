namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// Événement d'historique d'alerte. Append-only : jamais supprimé.
/// </summary>
public class AlertTimelineEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AlertId { get; set; }
    public Alert? Alert { get; set; }

    /// <summary>
    /// detected | report_submitted | report_validated | report_rejected |
    /// capa_created | monitoring_outcome | archived | comment_added | comment_archived |
    /// attachment_added | attachment_archived
    /// </summary>
    public string EventType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Detail { get; set; }
    public string? ActorId { get; set; }
    public string? ActorName { get; set; }
    public Guid? RelatedId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
