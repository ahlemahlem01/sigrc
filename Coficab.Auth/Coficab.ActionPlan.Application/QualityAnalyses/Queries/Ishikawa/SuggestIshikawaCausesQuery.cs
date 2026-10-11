using Coficab.ActionPlan.Application.DTOs.Ishikawa;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Ishikawa;

public record SuggestIshikawaCausesQuery(SuggestIshikawaCausesRequestDto Request)
    : IRequest<SuggestIshikawaCausesResponseDto>;

public class SuggestIshikawaCausesQueryHandler
    : IRequestHandler<SuggestIshikawaCausesQuery, SuggestIshikawaCausesResponseDto>
{
    private readonly IApplicationDbContext _context;

    public SuggestIshikawaCausesQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<SuggestIshikawaCausesResponseDto> Handle(
        SuggestIshikawaCausesQuery query,
        CancellationToken cancellationToken)
    {
        var request = query.Request;
        var claim = await _context.Claims.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.ClaimId, cancellationToken)
            ?? throw new KeyNotFoundException($"Claim {request.ClaimId} introuvable.");

        var defect = claim.DefectType?.Trim() ?? string.Empty;
        var line = claim.ProductionLine?.Trim();
        var vital = string.IsNullOrWhiteSpace(request.ParetoVitalFew)
            ? line
            : request.ParetoVitalFew.Trim();

        // Historical causes from similar claims (same defect and/or same machine/line)
        var similarClaimIds = await _context.Claims.AsNoTracking()
            .Where(c => !c.IsArchived)
            .Where(c =>
                (!string.IsNullOrEmpty(defect) && c.DefectType == defect) ||
                (!string.IsNullOrEmpty(line) && c.ProductionLine == line) ||
                (!string.IsNullOrEmpty(vital) && c.ProductionLine == vital))
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);

        var historical = await _context.IshikawaCauses.AsNoTracking()
            .Where(c => !c.IsArchived && similarClaimIds.Contains(c.ClaimId))
            .Select(c => new { c.Category, c.CauseDescription, c.IsRootCause })
            .ToListAsync(cancellationToken);

        var historicalGroups = historical
            .GroupBy(h => (h.Category, Key: Normalize(h.CauseDescription)))
            .Select(g => new
            {
                g.Key.Category,
                Sample = g.First().CauseDescription,
                Count = g.Count(),
                RootHits = g.Count(x => x.IsRootCause)
            })
            .OrderByDescending(g => g.Count)
            .ToList();

        var items = new List<SuggestedIshikawaCauseDto>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        // RED — already seen ≥ 3 times in plant history for similar machine/defect
        foreach (var h in historicalGroups.Where(g => g.Count >= 3).Take(8))
        {
            AddUnique(items, seen, new SuggestedIshikawaCauseDto
            {
                Category = h.Category,
                CauseDescription = h.Sample,
                ProbabilityTier = IshikawaProbabilityTier.Red,
                TierLabel = "Haute probabilité",
                Source = "HISTORICAL",
                HistoricalCount = h.Count,
                Confidence = Math.Min(0.95, 0.55 + h.Count * 0.08),
                IsRootCauseCandidate = h.RootHits > 0,
                Rationale = $"Déjà survenue {h.Count}× dans l’usine sur ce type de machine/défaut" +
                            (string.IsNullOrEmpty(vital) ? "." : $" (contexte Pareto : {vital}).")
            });
        }

        // Also surface 1–2× history as yellow-leaning historical (still useful)
        foreach (var h in historicalGroups.Where(g => g.Count is >= 1 and < 3).Take(4))
        {
            AddUnique(items, seen, new SuggestedIshikawaCauseDto
            {
                Category = h.Category,
                CauseDescription = h.Sample,
                ProbabilityTier = IshikawaProbabilityTier.Yellow,
                TierLabel = "Probabilité moyenne",
                Source = "HISTORICAL",
                HistoricalCount = h.Count,
                Confidence = 0.45 + h.Count * 0.1,
                IsRootCauseCandidate = h.RootHits > 0,
                Rationale = $"Vu {h.Count}× en historique usine — à confirmer sur cette réclamation."
            });
        }

        // YELLOW — industry automotive knowledge for this process
        foreach (var industry in GetIndustryCauses(defect, vital))
        {
            AddUnique(items, seen, industry);
        }

        // GREEN — theoretical / creative hypotheses (always low probability)
        foreach (var hypo in GetHypotheses(defect, vital, line))
        {
            AddUnique(items, seen, hypo);
        }

        // Ensure each 6M has at least something when empty history
        EnsureCategoryCoverage(items, seen, defect, vital);

        var redCount = items.Count(i => i.ProbabilityTier == IshikawaProbabilityTier.Red);
        var explanation =
            $"Ishikawa context-aware généré pour « {defect} »" +
            (string.IsNullOrEmpty(vital) ? "" : $" · barre Pareto 80% : {vital}") +
            $" · {redCount} cause(s) rouge(s) issues de l’historique usine, " +
            $"{items.Count(i => i.ProbabilityTier == IshikawaProbabilityTier.Yellow)} jaune(s) industrie/historique, " +
            $"{items.Count(i => i.ProbabilityTier == IshikawaProbabilityTier.Green)} verte(s) hypothèses.";

        return new SuggestIshikawaCausesResponseDto
        {
            ClaimId = claim.Id,
            DefectType = defect,
            ProductionLine = line,
            ParetoVitalFew = vital,
            Explanation = explanation,
            Items = items
                .OrderBy(i => i.ProbabilityTier)
                .ThenByDescending(i => i.Confidence)
                .ToList()
        };
    }

    private static void AddUnique(
        List<SuggestedIshikawaCauseDto> items,
        HashSet<string> seen,
        SuggestedIshikawaCauseDto item)
    {
        var key = $"{item.Category}|{Normalize(item.CauseDescription)}";
        if (!seen.Add(key)) return;
        items.Add(item);
    }

    private static string Normalize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var formD = text.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(formD.Length);
        foreach (var ch in formD)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                sb.Append(ch);
        }
        var cleaned = Regex.Replace(sb.ToString().Normalize(NormalizationForm.FormC), @"\s+", " ");
        return cleaned;
    }

    private static IEnumerable<SuggestedIshikawaCauseDto> GetIndustryCauses(string defect, string? vital)
    {
        var d = Normalize(defect);
        var context = string.IsNullOrEmpty(vital) ? "ce procédé" : vital;

        if (d.Contains("soudure") || d.Contains("weld"))
        {
            yield return Yellow(IshikawaCategory.Machine, "Usure / dérive des électrodes de la pince robot",
                $"Connu industrie soudure robotisée ({context})");
            yield return Yellow(IshikawaCategory.Method, "Paramètres de soudure (courant/temps/pression) hors fenêtre process",
                "Standard IATF / PFMEA soudure");
            yield return Yellow(IshikawaCategory.Measurement, "Contrôle de continuité / pénétration du cordon insuffisant",
                "Cause détection classique automobile");
            yield return Yellow(IshikawaCategory.Material, "Variation d’épaisseur / revêtement de tôle fournisseur",
                "Connu supply chain carrosserie/câblage");
            yield return Yellow(IshikawaCategory.Manpower, "Formation incomplète sur séquence de reprise soudure",
                "Facteur humain process répétitif");
        }
        else if (d.Contains("isolation") || d.Contains("pvc") || d.Contains("gaine"))
        {
            yield return Yellow(IshikawaCategory.Material, "Lot matière PVC hors spécification (souplesse / humidité)",
                "Défaut isolation courant extrudeuses câbles");
            yield return Yellow(IshikawaCategory.Machine, "Déréglage tête d’extrusion / température hors tolérance",
                $"Procédé {context}");
            yield return Yellow(IshikawaCategory.Method, "Paramètres vitesse ligne non corrélés au diamètre câble",
                "Industrie câblage automobile");
            yield return Yellow(IshikawaCategory.Measurement, "Test d’isolement 500V non réalisé à 100% ou seuil trop bas",
                "Cause détection IATF");
            yield return Yellow(IshikawaCategory.Milieu, "Variation hygrométrie atelier impactant le PVC",
                "Milieu connu sur extrusions");
        }
        else if (d.Contains("sertissage") || d.Contains("crimp") || d.Contains("fakra"))
        {
            yield return Yellow(IshikawaCategory.Machine, "Usure outils de sertissage / hauteur hors tolérance",
                "Standard crimping automotive");
            yield return Yellow(IshikawaCategory.Measurement, "Contrôle dimensionnel / force de sertissage SPC en dérive",
                "Cause détection classique");
            yield return Yellow(IshikawaCategory.Method, "Gamme de réglage applicateur non suivie après changement d’outil",
                "Industrie connectique");
            yield return Yellow(IshikawaCategory.Material, "Variation section fil / lot bornes hors tolérance",
                "Supply connecteurs");
        }
        else if (d.Contains("marquage") || d.Contains("laser") || d.Contains("datamatrix"))
        {
            yield return Yellow(IshikawaCategory.Machine, "Puissance laser dérivée / lentille polluée",
                "Industrie marquage laser");
            yield return Yellow(IshikawaCategory.Measurement, "Scanner DataMatrix en bout de ligne mal calibré",
                "Cause détection");
            yield return Yellow(IshikawaCategory.Method, "Recette marquage non adaptée à la couleur de gaine",
                "Know-how process");
        }
        else
        {
            yield return Yellow(IshikawaCategory.Method, "Écart à la gamme opératoire / standard travail",
                "Cause industrie générique");
            yield return Yellow(IshikawaCategory.Machine, "Dérive machine non détectée par la maintenance préventive",
                "TPM / automotive");
            yield return Yellow(IshikawaCategory.Measurement, "Contrôle qualité en sortie insuffisamment discriminants",
                "Cause détection IATF");
        }
    }

    private static IEnumerable<SuggestedIshikawaCauseDto> GetHypotheses(string defect, string? vital, string? line)
    {
        var ctx = vital ?? line ?? "la zone concernée";
        yield return Green(IshikawaCategory.Milieu,
            $"Impact humidité / température atelier sur {ctx} (hypothèse à vérifier)",
            "Hypothèse théorique — faible probabilité sans historique local");
        yield return Green(IshikawaCategory.Manpower,
            "Communication inter-équipes incomplète au changement de shift",
            "Hypothèse organisationnelle");
        yield return Green(IshikawaCategory.Method,
            $"Absence d’alarme / poka-yoke spécifique au défaut « {defect} »",
            "Hypothèse prévention");
        yield return Green(IshikawaCategory.Material,
            "Interaction croisée entre deux lots matières différents sur la même série",
            "Hypothèse supply cross-contamination");
    }

    private static void EnsureCategoryCoverage(
        List<SuggestedIshikawaCauseDto> items,
        HashSet<string> seen,
        string defect,
        string? vital)
    {
        foreach (IshikawaCategory cat in Enum.GetValues(typeof(IshikawaCategory)))
        {
            if (items.Any(i => i.Category == cat)) continue;
            AddUnique(items, seen, Green(cat,
                $"À investiguer — branche {cat} pour « {defect} »" +
                (string.IsNullOrEmpty(vital) ? "" : $" (focus {vital})"),
                "Couverture 6M — hypothèse de démarrage"));
        }
    }

    private static SuggestedIshikawaCauseDto Yellow(IshikawaCategory cat, string text, string rationale) => new()
    {
        Category = cat,
        CauseDescription = text,
        ProbabilityTier = IshikawaProbabilityTier.Yellow,
        TierLabel = "Probabilité moyenne",
        Source = "INDUSTRY",
        Confidence = 0.62,
        Rationale = rationale,
        HistoricalCount = 0
    };

    private static SuggestedIshikawaCauseDto Green(IshikawaCategory cat, string text, string rationale) => new()
    {
        Category = cat,
        CauseDescription = text,
        ProbabilityTier = IshikawaProbabilityTier.Green,
                TierLabel = "Faible probabilité",
        Source = "HYPOTHESIS",
        Confidence = 0.28,
        Rationale = rationale,
        HistoricalCount = 0
    };
}
