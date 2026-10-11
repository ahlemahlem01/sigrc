namespace Coficab.ActionPlan.Core.Entities;
public class Claim
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string DefectType { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public string LotNumber { get; set; } = string.Empty;
    public string? SerialNumber { get; set; }
    public string Description { get; set; } = string.Empty;
    public string StatusCode { get; set; } = "DRAFT";
    /// <summary>Identity user id of the employee assigned to investigate this claim.</summary>
    public string? AssignedToId { get; set; }
    /// <summary>Display name cached at assignment time (Auth lives in another DB).</summary>
    public string? AssignedToName { get; set; }
    public DateTime? AssignedAt { get; set; }
    /// <summary>Optional target date for closing this claim (SLA / date limite).</summary>
    public DateTime? Deadline { get; set; }
    /// <summary>Set automatically when status becomes CLOTUREE / CLOSED.</summary>
    public DateTime? CompletedAt { get; set; }
    /// <summary>CompletedAt &lt;= Deadline at closure time; null if no deadline.</summary>
    public bool? IsOnTime { get; set; }
    /// <summary>Historical P50 resolution days estimated at creation (does not set Deadline).</summary>
    public double? EstimatedDaysP50 { get; set; }
    /// <summary>Historical P80 resolution days estimated at creation (does not set Deadline).</summary>
    public double? EstimatedDaysP80 { get; set; }
    /// <summary>type_severity | severity | global</summary>
    public string? EstimateMethod { get; set; }
    public int? EstimateSampleSize { get; set; }
    public DateTime? EstimatedAt { get; set; }
    // Informations complémentaires
    public DateTime DetectionDate { get; set; } = DateTime.UtcNow;
    public string? CreatedById { get; set; }
    // 📌 Champs pour la pièce jointe (stockée en base de données)
    public string? AttachmentName { get; set; }
    public string? AttachmentContentType { get; set; }
    public byte[]? AttachmentData { get; set; }
    // Suivi et traçabilité
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedById { get; set; }
    public bool IsArchived { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? CreatedBy { get; set; }
    // Traçabilité production — renseignée au démarrage de l'analyse (ou
    // plus tard, via édition), pas obligatoire à la création du claim.
    public string? ProductionLine { get; set; }
    public string? Shift { get; set; }
    public string? AnalysisNotes { get; set; }
    // 📌 Quantités pour le calcul du PPM (Parts Per Million) lié au défaut.
    public int? ProducedQuantity { get; set; }
    public int? DefectiveQuantity { get; set; }
}
