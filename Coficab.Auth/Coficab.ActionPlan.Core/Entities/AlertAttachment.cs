namespace Coficab.ActionPlan.Core.Entities;

/// <summary>Pièce jointe d'alerte. L'archivage conserve le fichier.</summary>
public class AlertAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AlertId { get; set; }
    public Alert? Alert { get; set; }

    public string FileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public byte[] Data { get; set; } = Array.Empty<byte>();
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }
}
