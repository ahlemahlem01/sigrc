namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
public class ClaimDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string DefectType { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public string LotNumber { get; set; } = string.Empty;
    public string? SerialNumber { get; set; }
    public string Description { get; set; } = string.Empty;
    public string StatusCode { get; set; } = string.Empty;
    public DateTime DetectionDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? Deadline { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool? IsOnTime { get; set; }
    public double? EstimatedDaysP50 { get; set; }
    public double? EstimatedDaysP80 { get; set; }
    public string? EstimateMethod { get; set; }
    public int? EstimateSampleSize { get; set; }
    public DateTime? EstimatedAt { get; set; }
    public string? CreatedBy { get; set; }
    public string? AssignedToId { get; set; }
    public string? AssignedToName { get; set; }
    public DateTime? AssignedAt { get; set; }
    // 📌 AJOUTER CETTE PROPRIÉTÉ POUR LE FICHIER
    public string? AttachmentName { get; set; }
    // 📌 Quantités pour le calcul du PPM lié au défaut (voir Claim.cs).
    // Le PPM lui-même n'est PAS un champ ici : il est recalculé côté front
    // (utils/ppm.ts) à partir de ces deux valeurs brutes.
    public int? ProducedQuantity { get; set; }
    public int? DefectiveQuantity { get; set; }
}