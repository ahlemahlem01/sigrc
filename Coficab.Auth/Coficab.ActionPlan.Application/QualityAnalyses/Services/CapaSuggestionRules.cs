using Coficab.ActionPlan.Core.DTOs.Claims;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Suggestions CAPA locales (fallback / complément à Gemini).
/// Corrective ← Occurrence ; Préventive ← Détection.
/// </summary>
public static class CapaSuggestionRules
{
    public static SuggestCapaResponseDto BuildLocal(SuggestCapaRequestDto request)
    {
        var claimLabel = string.IsNullOrWhiteSpace(request.ClaimTitle)
            ? "réclamation"
            : request.ClaimTitle.Trim();

        var occ = Truncate(request.RootCauseOccurrence, 280);
        var det = Truncate(request.RootCauseDetection, 280);
        var problem = Truncate(request.ProblemStatement, 200);

        return new SuggestCapaResponseDto
        {
            PlanTitle = $"CAPA — {Truncate(claimLabel, 80)}",
            PlanDescription =
                $"Plan CAPA issu du 5 Why (IATF).\n" +
                $"Problème : {problem}\n\n" +
                $"Cause Occurrence : {occ}\n\n" +
                $"Cause Détection : {det}",
            Actions = new List<SuggestedCapaActionDto>
            {
                new()
                {
                    Kind = "CORRECTIVE",
                    Branch = "OCCURRENCE",
                    Title = "Action corrective — éliminer la cause d'apparition",
                    Description =
                        $"Corriger durablement la cause d'occurrence identifiée.\n" +
                        $"Cause racine Occurrence : {occ}\n" +
                        "Définir le standard / process / poka-yoke à mettre en place, critère de réussite et preuve.",
                    Priority = 1,
                    SuggestedDeadlineDays = 14
                },
                new()
                {
                    Kind = "PREVENTIVE",
                    Branch = "DETECTION",
                    Title = "Action préventive — renforcer la détection",
                    Description =
                        $"Empêcher qu'un défaut similaire échappe au contrôle.\n" +
                        $"Cause racine Détection : {det}\n" +
                        "Mettre à jour le standard de contrôle, fréquence, moyen, MSA / formation et critères d'acceptation.",
                    Priority = 1,
                    SuggestedDeadlineDays = 21
                }
            }
        };
    }

    private static string Truncate(string? text, int max)
    {
        var t = (text ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(t)) return "(non renseigné)";
        return t.Length <= max ? t : t[..max] + "…";
    }
}
