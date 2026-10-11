using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Claims;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Ishikawa;

public class GetFiveWhySuggestionsQueryHandler
    : IRequestHandler<GetFiveWhySuggestionsQuery, List<FiveWhySuggestionDto>>
{
    private readonly IApplicationDbContext _context;

    private static readonly string[] AllCategories =
    {
        "Manpower", "Machine", "Material", "Method", "Milieu", "Measurement"
    };

    private static readonly Dictionary<string, string[]> CategoryKeywords = new()
    {
        ["Machine"] = new[] { "machine", "réglage", "reglage", "calibrage", "équipement", "equipement", "outillage", "usure", "extrudeuse", "collier chauffant", "surchauffe" },
        ["Method"] = new[] { "méthode", "methode", "procédure", "procedure", "plan de contrôle", "plan de controle", "instruction", "process", "processus", "gmao", "planification", "maintenance préventive", "maintenance preventive" },
        ["Material"] = new[] { "matière", "matiere", "matériau", "materiau", "composant", "fournisseur", "lot", "matière première", "polymère", "polymere", "pvc" },
        ["Manpower"] = new[] { "opérateur", "operateur", "formation", "main d'œuvre", "main d'oeuvre", "compétence", "competence", "personnel", "technicien" },
        ["Milieu"] = new[] { "environnement", "milieu", "température", "temperature", "humidité", "humidite", "poussière", "poussiere", "atelier", "éclairage", "eclairage" },
        ["Measurement"] = new[] { "mesure", "contrôle", "controle", "instrument", "capteur", "calibration", "fréquence", "frequence", "métrologie", "metrologie", "serrage", "bornes électriques", "bornes electriques" },
    };

    public GetFiveWhySuggestionsQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<FiveWhySuggestionDto>> Handle(
        GetFiveWhySuggestionsQuery request, CancellationToken cancellationToken)
    {
        // ⚠️ AJUSTE ICI si le DbSet/entité s'appelle autrement chez toi
        var analysis = await _context.FiveWhyAnalyses
            .FirstOrDefaultAsync(a => a.ClaimId == request.ClaimId, cancellationToken);

        if (analysis == null)
            return new List<FiveWhySuggestionDto>();

        var steps = await _context.FiveWhySteps
            .Where(s => s.AnalysisId == analysis.Id && !s.IsArchived)
            .OrderBy(s => s.StepNumber)
            .ToListAsync(cancellationToken);

        if (steps.Count == 0)
            return new List<FiveWhySuggestionDto>();

        var lastStepNumber = steps[^1].StepNumber;
        var suggestions = new List<FiveWhySuggestionDto>();

        foreach (var category in AllCategories)
        {
            var keywords = CategoryKeywords[category];

            // Cherche en partant de la dernière étape (analyse la plus mûre)
            // vers la première, et prend le premier match trouvé.
            FiveWhyStep? bestMatch = null;
            foreach (var step in steps.OrderByDescending(s => s.StepNumber))
            {
                var lower = step.Answer.ToLowerInvariant();
                if (keywords.Any(lower.Contains))
                {
                    bestMatch = step;
                    break;
                }
            }

            // 🔧 CORRECTIF : si aucune étape ne mentionne cette catégorie, on
            // ne génère PAS de suggestion pour elle. Avant, un texte
            // placeholder ("Aucun élément explicite...") était renvoyé pour
            // forcer les 6 branches à apparaître — mais ce placeholder était
            // traité par le frontend comme une vraie cause et polluait le
            // diagramme. Mieux vaut 2 branches pertinentes et vides ailleurs
            // qu'un faux remplissage sur les 6.
            if (bestMatch == null)
            {
                continue;
            }

            var distanceFromEnd = lastStepNumber - bestMatch.StepNumber;
            var confidence = Math.Max(0.3, 0.85 - distanceFromEnd * 0.15);

            suggestions.Add(new FiveWhySuggestionDto
            {
                Category = category,
                CauseDescription = bestMatch.Answer,
                IsRootCause = bestMatch.StepNumber == lastStepNumber,
                FiveWhyStepId = bestMatch.Id,
                FiveWhyStepIndex = bestMatch.StepNumber,
                Confidence = Math.Round(confidence, 2)
            });
        }

        // 🔧 Garde-fou : si aucune catégorie n'a matché du tout (5 Why trop
        // générique, vocabulaire non couvert par les mots-clés), on retombe
        // sur la dernière étape (= cause racine du 5 Why) rattachée à
        // "Method", qui est la catégorie par défaut la plus fréquente en
        // analyse qualité quand la cause est procédurale/organisationnelle.
        // Ça évite un diagramme totalement vide sans jamais réintroduire de
        // texte factice sur les autres branches.
        if (suggestions.Count == 0)
        {
            var lastStep = steps[^1];
            suggestions.Add(new FiveWhySuggestionDto
            {
                Category = "Method",
                CauseDescription = lastStep.Answer,
                IsRootCause = true,
                FiveWhyStepId = lastStep.Id,
                FiveWhyStepIndex = lastStep.StepNumber,
                Confidence = 0.3
            });
        }

        return suggestions;
    }
}