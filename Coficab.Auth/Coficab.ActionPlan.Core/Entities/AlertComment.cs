namespace Coficab.ActionPlan.Core.Entities;

/// <summary>Commentaire d'alerte. L'archivage remplace toute suppression.</summary>
public class AlertComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AlertId { get; set; }
    public Alert? Alert { get; set; }

    public string AuthorId { get; set; } = string.Empty;
    public string? AuthorName { get; set; }
    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }
}
