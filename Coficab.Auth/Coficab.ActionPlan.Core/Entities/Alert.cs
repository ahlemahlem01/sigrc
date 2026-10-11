namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// Alerte qualité / ML (ex. anomalie de volume de claims).
/// </summary>
public class Alert
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Type d'alerte — actuellement "anomaly".</summary>
    public string Type { get; set; } = "anomaly";

    public string DefectType { get; set; } = string.Empty;
    public string ProductionLine { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    /// <summary>Score Z de la dernière semaine vs moyenne mobile 4 semaines.</summary>
    public double ZScore { get; set; }

    /// <summary>Nombre de claims sur la semaine courante (détection).</summary>
    public int CurrentCount { get; set; }

    /// <summary>Moyenne des 4 semaines précédentes (baseline).</summary>
    public double BaselineMean { get; set; }

    public DateTime DetectedAt { get; set; } = DateTime.UtcNow;

    /// <summary>pending_validation | validated | rejected | archived. Jamais supprimé.</summary>
    public string Status { get; set; } = "pending_validation";

    /// <summary>manual | auto-resolved | abandoned</summary>
    public string? ArchiveReason { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public string? ArchivedBy { get; set; }

    /// <summary>Statut restauré par un désarchivage. Jamais affiché tel quel.</summary>
    public string? StatusBeforeArchive { get; set; }

    /// <summary>Département concerné (optionnel).</summary>
    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    /// <summary>Mini-analyse Gemini : reformulation du problème.</summary>
    public string? AiProblem { get; set; }

    /// <summary>Mini-analyse Gemini : cause probable (hypothèse).</summary>
    public string? AiProbableCause { get; set; }

    /// <summary>Mini-analyse Gemini : conséquences possibles.</summary>
    public string? AiConsequences { get; set; }

    /// <summary>Horodatage de génération de l'analyse IA.</summary>
    public DateTime? AiAnalyzedAt { get; set; }
}
