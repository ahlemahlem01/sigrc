using Coficab.ActionPlan.Core.DTOs.Claims;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Suggestions CAPA locales (fallback / complément à Gemini).
/// The plan has one type chosen by the person (PAC corrective, PAP preventive, PA improvement); both actions follow it:
/// one on the Occurrence cause, one on the Detection cause.
/// </summary>
public static class CapaSuggestionRules
{
    public static SuggestCapaResponseDto BuildLocal(SuggestCapaRequestDto request)
    {
        var type = CapaPlanTypeRules.Resolve(request.PlanType, internalClaim: false);
        var kind = CapaPlanTypeRules.KindOf(type);

        var claimLabel = string.IsNullOrWhiteSpace(request.ClaimTitle)
            ? "réclamation"
            : request.ClaimTitle.Trim();

        var occ = Truncate(request.RootCauseOccurrence, 280);
        var det = Truncate(request.RootCauseDetection, 280);
        var problem = Truncate(request.ProblemStatement, 200);

        var (planLabel, occTitle, occText, detTitle, detText) = type switch
        {
            ActionPlanType.PAP => (
                "Plan préventif",
                "Action préventive — empêcher l'apparition ailleurs",
                "Étendre la correction de la cause d'occurrence aux postes, lignes et produits similaires pour que le défaut n'apparaisse pas ailleurs.",
                "Action préventive — renforcer la détection",
                "Empêcher qu'un défaut similaire échappe au contrôle : mettre à jour le standard de contrôle, la fréquence, le moyen, la formation et les critères d'acceptation."),
            ActionPlanType.PA => (
                "Plan d'amélioration",
                "Action d'amélioration — renforcer le process",
                "Améliorer le process pour réduire durablement la variabilité liée à la cause d'occurrence : standard, réglage, poka-yoke ou automatisation.",
                "Action d'amélioration — renforcer le système de contrôle",
                "Améliorer le système de détection pour voir plus tôt les écarts : moyen de mesure, fréquence, critères et traçabilité des contrôles."),
            _ => (
                "CAPA",
                "Action corrective — éliminer la cause d'apparition",
                "Corriger durablement la cause d'occurrence identifiée : définir le standard, le process ou le poka-yoke à mettre en place.",
                "Action corrective — fiabiliser la détection",
                "Corriger le contrôle qui n'a pas vu le défaut : mettre à jour le standard de contrôle, la fréquence, le moyen et les critères d'acceptation."),
        };

        return new SuggestCapaResponseDto
        {
            PlanTitle = $"{planLabel} — {Truncate(claimLabel, 80)}",
            PlanDescription =
                $"{planLabel} issu du 5 Why (IATF).\n" +
                $"Problème : {problem}\n\n" +
                $"Cause Occurrence : {occ}\n\n" +
                $"Cause Détection : {det}",
            Actions = new List<SuggestedCapaActionDto>
            {
                new()
                {
                    Kind = kind,
                    Branch = "OCCURRENCE",
                    Title = occTitle,
                    Description = $"{occText}\nCause racine Occurrence : {occ}\nPrécisez le critère de réussite et la preuve.",
                    Priority = 1,
                    SuggestedDeadlineDays = 14
                },
                new()
                {
                    Kind = kind,
                    Branch = "DETECTION",
                    Title = detTitle,
                    Description = $"{detText}\nCause racine Détection : {det}\nPrécisez le critère de réussite et la preuve.",
                    Priority = 1,
                    SuggestedDeadlineDays = 21
                }
            }
        };
    }

    /// <summary>Whatever an AI answered, every action carries the nature of the chosen plan and a valid branch.</summary>
    public static SuggestCapaResponseDto AlignWithPlanType(SuggestCapaResponseDto response, ActionPlanType type)
    {
        var kind = CapaPlanTypeRules.KindOf(type);
        for (var i = 0; i < response.Actions.Count; i++)
        {
            response.Actions[i].Kind = kind;
            response.Actions[i].Branch = CapaPlanTypeRules.NormalizeBranch(response.Actions[i].Branch, i);
        }
        return response;
    }

    private static string Truncate(string? text, int max)
    {
        var t = (text ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(t)) return "(non renseigné)";
        return t.Length <= max ? t : t[..max] + "…";
    }
}
