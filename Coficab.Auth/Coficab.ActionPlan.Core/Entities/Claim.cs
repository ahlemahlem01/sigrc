namespace Coficab.ActionPlan.Core.Entities;
public class Claim
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Permanent reference, e.g. REC-2026-0042: year of creation and running number. Never reused.</summary>
    public string? Reference { get; set; }
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
    // Computer vision (active learning): what the image model proposed, how sure it was, and whether the operator's
    // final defect code is a learning signal (different from the proposal, or the proposal was not confident enough).
    public string? CvPredictedDefectType { get; set; }
    public double? CvConfidence { get; set; }
    public bool CvCorrectionLogged { get; set; }
    // The quality engineer's review of that photo before it trains the image model: null = not reviewed yet, "VALIDATED" or "REJECTED".
    // The validated code is the label that trains (the operator's code unless the engineer changes it).
    public string? CvValidationStatus { get; set; }
    public string? CvValidatedDefectType { get; set; }
    public string? CvValidatedById { get; set; }
    public DateTime? CvValidatedAt { get; set; }
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
