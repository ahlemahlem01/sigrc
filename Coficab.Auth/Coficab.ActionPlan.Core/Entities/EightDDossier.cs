using Coficab.ActionPlan.Core.Common;

namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// Dossier 8D unifié lié à une réclamation. D2/D4/D5 restent dans Claim / 5 Why / Ishikawa / CAPA.
/// </summary>
public class EightDDossier : BaseEntity
{
    public Guid ClaimId { get; set; }

    /// <summary>1–8 : première étape incomplète (calculée aussi à la lecture).</summary>
    public int CurrentStep { get; set; } = 1;

    /// <summary>IN_PROGRESS | PENDING_VALIDATION | VALIDATED | REJECTED | CLOSED</summary>
    public string StatusCode { get; set; } = "IN_PROGRESS";

    // D1 — Équipe
    public string? ChampionId { get; set; }
    public string? ChampionName { get; set; }
    public string? TeamMembers { get; set; }
    public DateTime? TeamFormedAt { get; set; }

    // D3 — Confinement
    public string? ContainmentDescription { get; set; }
    public string? ContainmentOwner { get; set; }
    public DateTime? ContainmentImplementedAt { get; set; }
    public bool ContainmentVerified { get; set; }

    // D6 — Efficacité
    public string? EffectivenessMethod { get; set; }
    public int? LotsChecked { get; set; }
    public int? DefectsFound { get; set; }
    public string? EffectivenessNotes { get; set; }
    public bool EffectivenessValidated { get; set; }
    public DateTime? EffectivenessValidatedAt { get; set; }

    // D7 — Préventif / standardisation
    public string? PreventiveDescription { get; set; }
    public string? PreventiveScope { get; set; }
    public bool PreventiveStandardized { get; set; }
    public DateTime? PreventiveCompletedAt { get; set; }

    // D8 — Clôture
    public string? CongratulationsNote { get; set; }
    public string? CustomerName { get; set; }
    public DateTime? ClosedAt { get; set; }
    public string? ClosedById { get; set; }
    public DateTime? CustomerPdfGeneratedAt { get; set; }
    public byte[]? CustomerPdfData { get; set; }

    // Validation dossier unifié
    public DateTime? SubmittedAt { get; set; }
    public string? SubmittedById { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public string? ValidatedById { get; set; }
    public string? ValidationComment { get; set; }
}
