namespace Coficab.ActionPlan.Core.Entities;

public class Document
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public string Category { get; set; } = "general";

    // Propriétaire réel du document — ajouté pour filtrer par employé
    public string UserId { get; set; } = string.Empty;

    public string? LastViewedByUserId { get; set; }
    public DateTime? LastViewedAt { get; set; }
    public List<DocumentFavorite> Favorites { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
}

public class DocumentFavorite
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = null!;
    public string UserId { get; set; } = string.Empty;
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}