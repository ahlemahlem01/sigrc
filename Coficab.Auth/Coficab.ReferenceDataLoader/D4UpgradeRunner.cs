using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ReferenceDataLoader;

/// <summary>
/// Makes the generated dataset follow the D4 order (D3 → Ishikawa → Pareto/priority cause → 5 Why):
/// every claim that is past the start gets the pieces its stage implies, and nothing else.
///
/// Additive and idempotent: it only INSERTS missing rows (8D dossier, Ishikawa causes, priority cause,
/// 5 Why steps). It never deletes or rewrites an existing row, skips archived claims and claims coming from an
/// import batch, and does nothing for a claim that already has the piece. Without <c>apply</c> it only reports.
/// </summary>
internal sealed class D4UpgradeRunner
{
    private const string Author = "seed-d4";

    private readonly ActionPlanDbContext _ap;
    private readonly bool _apply;

    public D4UpgradeRunner(ActionPlanDbContext ap, bool apply)
    {
        _ap = ap;
        _apply = apply;
    }

    private enum Stage { Skip, D3InProgress, IshikawaPartial, PriorityChosen, FiveWhyUnderway, Complete }

    private sealed record Cause(string Category, string Text, bool CanBeRoot);

    // defect → possible causes (first root-capable cause is the usual root). Same vocabulary as the historical workbook.
    private static readonly Dictionary<string, Cause[]> Causes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Soudure défectueuse"] = [new("Machine", "Usure des électrodes de soudure non détectée à temps", true), new("Machine", "Déréglage de la pression de la pince", true), new("Méthode", "Paramètres de soudure (pression / temps) non standardisés entre équipes", false), new("Matière", "Lot de feuillard avec épaisseur en limite de tolérance", false), new("Main-d'œuvre", "Changement d'électrodes réalisé sans la procédure de contrôle", false), new("Mesure", "Contrôle de résistance en ligne peu sensible à la soudure froide", false)],
        ["Isolation endommagée"] = [new("Machine", "Guide d'extrusion usé créant un point de frottement", true), new("Machine", "Lame de coupe émoussée", true), new("Méthode", "Fréquence de remplacement des lames non définie", false), new("Milieu", "Poussières abrasives sur le chemin de câble", false), new("Main-d'œuvre", "Manipulation des bobines sans protection", false)],
        ["Dimension hors tolérance"] = [new("Machine", "Réglage de la table de coupe dérivé après changement de référence", true), new("Mesure", "Gabarit de mesure non étalonné", true), new("Méthode", "Première pièce non validée après réglage", false), new("Main-d'œuvre", "Saisie manuelle de la longueur erronée", false)],
        ["Coupure fil"] = [new("Machine", "Hauteur de sertissage trop serrée sur l'applicateur", true), new("Matière", "Conducteur fragilisé sur une bobine du fournisseur", true), new("Méthode", "Contrôle de traction du sertissage trop espacé", false), new("Main-d'œuvre", "Réglage de l'applicateur par un opérateur non habilité", false)],
        ["Manque de sertissage"] = [new("Machine", "Réglage hauteur de sertissage hors fenêtre après changement d'applicateur", true), new("Méthode", "Fiche de réglage applicateur incomplète", false), new("Mesure", "Contrôle crimp force non réalisé en début de série", false), new("Matière", "Terminal hors spécification dimensionnelle", true)],
        ["Débordement étain"] = [new("Machine", "Température du four au-dessus de la fenêtre", true), new("Méthode", "Quantité d'étain non limitée par le mode opératoire", false), new("Main-d'œuvre", "Retouche manuelle sans gabarit", false)],
        ["Connecteur desserré"] = [new("Méthode", "Contrôle du verrouillage CPA absent du poste", true), new("Main-d'œuvre", "Cadence élevée en fin d'équipe", false), new("Matière", "Connecteur avec levier déformé", true)],
        ["Marquage illisible"] = [new("Machine", "Tête d'impression encrassée", true), new("Matière", "Encre hors date de validité", true), new("Méthode", "Nettoyage de la tête non planifié", false)],
        ["Couleur incorrecte"] = [new("Matière", "Mauvais lot de mélange maître chargé en extrusion", true), new("Méthode", "Contrôle couleur au changement de bobine non formalisé", false), new("Main-d'œuvre", "Erreur de chargement trémie", false)],
        ["Contamination surface"] = [new("Milieu", "Zone de soudure exposée aux projections d'huile", true), new("Méthode", "Nettoyage du poste non tracé", false), new("Main-d'œuvre", "Gants non remplacés entre les références", true)],
        ["Non-conformité emballage"] = [new("Méthode", "Spécification emballage client non reprise dans l'instruction de poste", true), new("Main-d'œuvre", "Séparateurs omis en fin de conditionnement", false), new("Mesure", "Pas de contrôle emballage avant expédition", false)],
        ["Étiquette manquante"] = [new("Méthode", "Étape d'étiquetage sans contrôle de présence", true), new("Machine", "Imprimante d'étiquettes en erreur sans alarme", true), new("Main-d'œuvre", "Rouleau d'étiquettes épuisé non remplacé", false)],
        ["Polarité inversée"] = [new("Main-d'œuvre", "Erreur d'insertion des cavités sur le plan de câblage", true), new("Méthode", "Plan de câblage ambigu sur la révision en cours", true), new("Mesure", "Test électrique ne couvre pas toutes les polarités", false)],
        ["Longueur câble incorrecte"] = [new("Machine", "Dérive du codeur de longueur de la table de coupe", true), new("Mesure", "Contrôle longueur par échantillonnage trop espacé", false), new("Méthode", "Recoupe sans nouvelle validation", false)],
    };

    private static readonly Cause[] GenericCauses =
    [
        new("Méthode", "Standard de travail incomplet pour ce mode de défaut", true),
        new("Main-d'œuvre", "Formation incomplète sur la séquence concernée", false),
        new("Mesure", "Contrôle en ligne insuffisamment sensible", false),
    ];

    private static readonly Dictionary<string, string> CategoryCode = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Main-d'œuvre"] = "Manpower", ["Machine"] = "Machine", ["Matière"] = "Material",
        ["Méthode"] = "Method", ["Milieu"] = "Milieu", ["Mesure"] = "Measurement",
    };

    private static int Hash(Guid id, int salt = 0)
    {
        var b = id.ToByteArray();
        var h = salt * 7919 + 17;
        foreach (var x in b) h = unchecked(h * 31 + x);
        return Math.Abs(h == int.MinValue ? 0 : h);
    }

    private static Stage StageOf(Claim c)
    {
        switch ((c.StatusCode ?? string.Empty).ToUpperInvariant())
        {
            case "EN_ANALYSE":
                var roll = Hash(c.Id) % 100;
                return roll < 25 ? Stage.D3InProgress : roll < 50 ? Stage.IshikawaPartial : roll < 75 ? Stage.PriorityChosen : Stage.FiveWhyUnderway;
            case "PENDING_VALIDATION":
            case "VALIDATED":
            case "CLOTUREE":
                return Stage.Complete;
            default:
                return Stage.Skip; // OUVERTE / ASSIGNED / DRAFT: analysis has not started
        }
    }

    public async Task<int> RunAsync(CancellationToken ct)
    {
        Console.WriteLine(_apply ? "== Mise à niveau D4 (écriture) ==" : "== Mise à niveau D4 (aperçu, rien n'est écrit) ==");

        var claims = await _ap.Claims.IgnoreQueryFilters().AsNoTracking()
            .Where(c => !c.IsArchived && (c.CreatedBy == null || !c.CreatedBy.StartsWith("import:")))
            .ToListAsync(ct);

        var haveDossier = (await _ap.EightDDossiers.IgnoreQueryFilters().AsNoTracking().Select(d => d.ClaimId).ToListAsync(ct)).ToHashSet();
        var haveCauses = (await _ap.IshikawaCauses.IgnoreQueryFilters().AsNoTracking().Select(c => c.ClaimId).Distinct().ToListAsync(ct)).ToHashSet();
        var analyses = await _ap.FiveWhyAnalyses.IgnoreQueryFilters()
            .Include(a => a.Steps)
            .Where(a => !a.IsArchived)
            .ToListAsync(ct);
        var analysisByClaim = analyses.GroupBy(a => a.ClaimId).ToDictionary(g => g.Key, g => g.First());
        var havePriority = (await _ap.PriorityCauses.AsNoTracking().Select(p => p.ClaimId).ToListAsync(ct)).ToHashSet();

        var counters = new Dictionary<string, int>();
        void Count(string key) => counters[key] = counters.GetValueOrDefault(key) + 1;
        var priorityRows = new List<(Guid Id, Guid ClaimId, string? Category, string Text, string Source, string ById, string? ByName, DateTime At)>();

        foreach (var claim in claims)
        {
            var stage = StageOf(claim);
            if (stage == Stage.Skip) continue;
            Count($"claims {stage}");

            var list = Causes.TryGetValue(claim.DefectType ?? string.Empty, out var known) ? known : GenericCauses;
            var rootCause = list.First(c => c.CanBeRoot);
            var assignee = claim.AssignedToName ?? claim.CreatedBy ?? "Équipe qualité";
            var start = claim.CreatedAt;

            // ── 8D dossier: D1–D3 (complete from "Ishikawa" on) and the closing steps for finished dossiers ──
            if (!haveDossier.Contains(claim.Id))
            {
                var d3Done = stage != Stage.D3InProgress;
                var finished = claim.StatusCode is "PENDING_VALIDATION" or "VALIDATED" or "CLOTUREE";
                var closed = claim.StatusCode is "VALIDATED" or "CLOTUREE";
                var dossier = new EightDDossier
                {
                    Id = Guid.NewGuid(),
                    ClaimId = claim.Id,
                    CreatedAt = start.AddHours(2),
                    CreatedBy = Author,
                    ChampionId = claim.AssignedToId,
                    ChampionName = assignee,
                    TeamMembers = $"Pilote : {assignee}\nProduction : chef de ligne {claim.ProductionLine}\nMéthodes : technicien process\nQualité : ingénieur qualité",
                    TeamFormedAt = start.AddHours(3),
                    ContainmentOwner = assignee,
                    ContainmentVerified = d3Done,
                    ContainmentImplementedAt = d3Done ? start.AddDays(1) : null,
                    ContainmentDescription = ContainmentPlan(claim, assignee, d3Done),
                    StatusCode = closed ? "CLOSED" : claim.StatusCode == "PENDING_VALIDATION" ? "PENDING_VALIDATION" : "IN_PROGRESS",
                    CurrentStep = !d3Done ? 3 : finished ? 8 : 4,
                };
                if (finished)
                {
                    var end = claim.CompletedAt ?? start.AddDays(14);
                    dossier.EffectivenessMethod = "Contrôle de 3 lots consécutifs après correction";
                    dossier.LotsChecked = 3;
                    dossier.DefectsFound = 0;
                    dossier.EffectivenessNotes = "Aucun défaut du même mode retrouvé sur les lots suivants.";
                    dossier.EffectivenessValidated = true;
                    dossier.EffectivenessValidatedAt = end.AddDays(-2);
                    dossier.PreventiveDescription = "Point ajouté au plan de contrôle et au standard de poste.";
                    dossier.PreventiveScope = "Même opération sur les lignes équivalentes";
                    dossier.PreventiveStandardized = true;
                    dossier.PreventiveCompletedAt = end.AddDays(-1);
                    dossier.CongratulationsNote = "Merci à l'équipe pour la clôture dans les délais.";
                    dossier.CustomerName = claim.ClientId;
                    dossier.SubmittedAt = end.AddDays(-1);
                    if (closed) { dossier.ValidatedAt = end; dossier.ClosedAt = end; }
                }
                Count("8D dossiers à ajouter");
                if (_apply) _ap.EightDDossiers.Add(dossier);
            }

            // ── Ishikawa causes: from "Ishikawa partial" on; one confirmed root once the 5 Why is under way/finished ──
            var needsCauses = stage is Stage.IshikawaPartial or Stage.PriorityChosen or Stage.FiveWhyUnderway or Stage.Complete;
            if (needsCauses && !haveCauses.Contains(claim.Id))
            {
                var take = stage == Stage.IshikawaPartial ? Math.Min(3, list.Length) : list.Length;
                var rootConfirmed = stage is Stage.FiveWhyUnderway or Stage.Complete;
                for (var i = 0; i < take; i++)
                {
                    var cause = list[i];
                    Count("causes Ishikawa à ajouter");
                    if (_apply)
                        _ap.IshikawaCauses.Add(new IshikawaCause
                        {
                            Id = Guid.NewGuid(),
                            ClaimId = claim.Id,
                            Category = Enum.Parse<IshikawaCategory>(CategoryCode[cause.Category]),
                            CauseDescription = cause.Text,
                            IsRootCause = rootConfirmed && cause == rootCause,
                            CreatedBy = Author,
                            CreatedAt = start.AddDays(1).AddHours(i),
                        });
                }
            }

            // ── Priority cause: chosen from "priority chosen" on ──
            var needsPriority = stage is Stage.PriorityChosen or Stage.FiveWhyUnderway or Stage.Complete;
            if (needsPriority && !havePriority.Contains(claim.Id))
            {
                Count("causes prioritaires à ajouter");
                priorityRows.Add((Guid.NewGuid(), claim.Id, CategoryCode[rootCause.Category], rootCause.Text,
                    Hash(claim.Id, 3) % 5 == 0 ? "mining" : "ishikawa", Author, assignee, start.AddDays(2)));
            }

            // ── 5 Why answers: under way (first answers) or finished (full chain) ──
            if (stage is Stage.FiveWhyUnderway or Stage.Complete && analysisByClaim.TryGetValue(claim.Id, out var analysis)
                && !analysis.Steps.Any(s => !string.IsNullOrWhiteSpace(s.Answer)))
            {
                var chain = WhyChain(claim, rootCause.Text);
                var count = stage == Stage.FiveWhyUnderway ? 1 + Hash(claim.Id, 5) % 3 : 5;
                for (var n = 1; n <= count; n++)
                {
                    Count("réponses 5 Pourquoi à ajouter");
                    if (_apply)
                        _ap.FiveWhySteps.Add(new FiveWhyStep
                        {
                            Id = Guid.NewGuid(),
                            AnalysisId = analysis.Id,
                            StepNumber = n,
                            Question = n == 1 ? "Pourquoi le défaut est-il apparu ?" : "Pourquoi ?",
                            Answer = chain[n - 1],
                        });
                }
            }
        }

        Console.WriteLine($"Réclamations examinées : {claims.Count}");
        foreach (var kv in counters.OrderBy(k => k.Key)) Console.WriteLine($"  {kv.Key,-34} {kv.Value}");

        if (!_apply)
        {
            Console.WriteLine("Aperçu terminé : relancez avec --apply pour écrire (ajouts uniquement).");
            return 0;
        }

        foreach (var r in priorityRows)
        {
            _ap.PriorityCauses.Add(new PriorityCause
            {
                Id = r.Id, ClaimId = r.ClaimId, Category = r.Category, CauseText = r.Text, Source = r.Source,
                SelectedById = r.ById, SelectedByName = r.ByName, SelectedAt = r.At, IsCurrent = true,
            });
        }
        await _ap.SaveChangesAsync(ct);
        Console.WriteLine("Écriture terminée.");
        return 0;
    }

    private static string ContainmentPlan(Claim claim, string owner, bool done)
    {
        var status = done ? "DONE" : "TODO";
        var checkedQty = claim.ProducedQuantity.HasValue ? (int?)(claim.ProducedQuantity.Value * 4 / 10) : null;
        object Action(string kind, string title, string location, int? qty = null, int? nok = null) => new
        {
            id = Guid.NewGuid().ToString("N")[..12],
            kind, title, owner, location,
            qtyChecked = qty, qtyNok = nok,
            status = kind == "STOP_SHIP" ? "DONE" : status, // the shipment stop is always the first reflex
            required = true,
        };
        var plan = new
        {
            v = 1,
            actions = new[]
            {
                Action("STOP_SHIP", "Bloquer les expéditions", "usine"),
                Action("QUARANTINE", "Quarantaine du lot / stock / WIP", "Magasin / ligne"),
                Action("SORT_100", "Tri 100 % des pièces à risque", "Ligne / stock", checkedQty ?? 300, claim.DefectiveQuantity),
                Action("INFORM_CUSTOMER", "Informer le client", "Qualité client"),
            },
            fieldOriginals = new Dictionary<string, string>(),
        };
        return JsonSerializer.Serialize(plan, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
    }

    private static string[] WhyChain(Claim claim, string rootCause) =>
    [
        $"« {claim.DefectType} » est apparu sur {claim.ProductionLine ?? "la ligne"} au poste concerné.",
        "Le paramètre ou le réglage associé était hors de sa fenêtre pendant la série.",
        "Aucune dérive n'a été détectée ni signalée pendant la production.",
        "Le suivi préventif de ce point n'était pas planifié dans la gamme.",
        rootCause,
    ];
}
