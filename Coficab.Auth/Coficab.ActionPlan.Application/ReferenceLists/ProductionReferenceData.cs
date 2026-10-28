using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.ReferenceLists;

/// <summary>
/// Master data of the Coficab Tunisia quality process that every installation must offer in its reference lists:
/// the visual-inspection defect codes (with their French display wording) and the direct customers (wire-harness
/// manufacturer sites). Entries are only ever added: an existing value, whatever its state, is never modified, and no
/// claim or 8D dossier is touched. The original value stays what a claim stores; the label is what the screens show.
/// </summary>
public static class ProductionReferenceData
{
    public const string UpdatedBy = "reference-data-initializer";

    public sealed record Entry(string ListKey, string Value, string? Label = null);

    public static readonly IReadOnlyList<Entry> Entries = new[]
    {
        // Business domains of the action plans (multi-sector scope); an installation can add its own in the reference lists
        new Entry(ReferenceListKeys.Domain, "QUALITY", "Qualité"),
        new Entry(ReferenceListKeys.Domain, "PRODUCTION", "Production"),
        new Entry(ReferenceListKeys.Domain, "MAINTENANCE", "Maintenance"),
        new Entry(ReferenceListKeys.Domain, "HSE", "HSE"),
        new Entry(ReferenceListKeys.Domain, "LOGISTICS", "Logistique"),
        new Entry(ReferenceListKeys.Domain, "HR", "Ressources humaines"),
        new Entry(ReferenceListKeys.Domain, "CONTINUOUS_IMPROVEMENT", "Amélioration continue"),
        // Cable defect codes (the catalogue of ml-service/defect_catalog.json; a test checks both stay identical)
        new Entry(ReferenceListKeys.DefectType, "CUT_INSULATION", "Coupure / Entaille sur gaine"),
        new Entry(ReferenceListKeys.DefectType, "SCRATCH_INSULATION", "Rayures / marques sur la gaine"),
        new Entry(ReferenceListKeys.DefectType, "COPPER_BROKEN", "Brins de cuivre cassés / désaffleurants"),
        new Entry(ReferenceListKeys.DefectType, "MARKING_DEFECT", "Défaut de marquage (illisible / absent)"),
        new Entry(ReferenceListKeys.DefectType, "COLOR_NON_CONFORMITY", "Couleur d'isolant non conforme"),
        new Entry(ReferenceListKeys.DefectType, "INSULATION_THICKNESS", "Épaisseur d'isolant hors tolérance"),
        new Entry(ReferenceListKeys.DefectType, "SPOOL_DAMAGED", "Touret / Emballage endommagé"),
        new Entry(ReferenceListKeys.DefectType, "SPARK_TEST_FAILURE", "Défaut à l'essai d'étincelage"),
        new Entry(ReferenceListKeys.DefectType, "CONDUCTOR_DIAMETER", "Diamètre du conducteur hors tolérance"),
        new Entry(ReferenceListKeys.DefectType, "OUTER_DIAMETER", "Diamètre extérieur hors tolérance"),
        new Entry(ReferenceListKeys.DefectType, "ECCENTRICITY", "Excentricité de l'isolant"),
        new Entry(ReferenceListKeys.DefectType, "CONDUCTOR_RESISTANCE", "Résistance électrique hors spécification"),
        new Entry(ReferenceListKeys.DefectType, "COPPER_OXIDATION", "Oxydation / ternissement du cuivre"),
        new Entry(ReferenceListKeys.DefectType, "COPPER_BURNT", "Brins brûlés / fondus (arc électrique)"),
        new Entry(ReferenceListKeys.DefectType, "INSULATION_BLISTER", "Cloques / bulles sur l'isolant"),
        new Entry(ReferenceListKeys.DefectType, "FOREIGN_MATTER", "Corps étranger dans l'isolant"),
        new Entry(ReferenceListKeys.DefectType, "STRAND_COUNT", "Nombre de brins incorrect"),
        new Entry(ReferenceListKeys.DefectType, "SPOOL_LENGTH", "Longueur sur touret incorrecte"),
        new Entry(ReferenceListKeys.DefectType, "LAY_LENGTH", "Pas de câblage non conforme"),
        new Entry(ReferenceListKeys.DefectType, "ADHESION_FAILURE", "Adhérence / pelabilité de l'isolant non conforme"),
        new Entry(ReferenceListKeys.DefectType, "CABLE_CRUSHED", "Câble écrasé / pincé"),

        // Direct customers: wire-harness manufacturer sites
        new Entry(ReferenceListKeys.Client, "COFAT-MATEUR"),
        new Entry(ReferenceListKeys.Client, "COFAT-TUNIS"),
        new Entry(ReferenceListKeys.Client, "LEONI-MATEUR"),
        new Entry(ReferenceListKeys.Client, "LEONI-MESSADINE"),
        new Entry(ReferenceListKeys.Client, "YAZAKI-GAFSA"),
        new Entry(ReferenceListKeys.Client, "APTIV-MONASTIR"),
        new Entry(ReferenceListKeys.Client, "DRAXLMAIER-SOUSSE"),
        new Entry(ReferenceListKeys.Client, "DRAXLMAIER-EL-FEJJA"),
        new Entry(ReferenceListKeys.Client, "KROMBERG-BEJA"),
    };

    /// <summary>Codes that were renamed: the old spelling becomes an alias of the new one (claims keep their text, statistics count both together).</summary>
    public static readonly IReadOnlyList<(string Old, string New)> Renames = new[]
    {
        ("COPPER_BLOOMING", "COPPER_BROKEN"),
        ("SURFACE_SCRATCH", "SCRATCH_INSULATION"),
        ("COLOR_MISMATCH", "COLOR_NON_CONFORMITY"),
        ("SPOOL_DAMAGE", "SPOOL_DAMAGED"),
    };

    /// <summary>Adds the entries that are missing from the reference lists; returns how many were added.</summary>
    public static async Task<int> EnsureAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var listKeys = Entries.Select(e => e.ListKey).Distinct().ToList();
        var existing = await db.ReferenceItems
            .Where(r => listKeys.Contains(r.ListKey))
            .Select(r => new { r.ListKey, r.Value, r.SortOrder })
            .ToListAsync(ct);

        var known = existing
            .Select(r => (r.ListKey, Value: r.Value.Trim().ToLowerInvariant()))
            .ToHashSet();
        var nextOrder = existing
            .GroupBy(r => r.ListKey)
            .ToDictionary(g => g.Key, g => g.Max(r => r.SortOrder));

        var now = DateTime.UtcNow;
        var added = 0;
        foreach (var entry in Entries)
        {
            if (!known.Add((entry.ListKey, entry.Value.ToLowerInvariant()))) continue;
            var order = nextOrder.GetValueOrDefault(entry.ListKey) + 1;
            nextOrder[entry.ListKey] = order;
            db.ReferenceItems.Add(new ReferenceItem
            {
                ListKey = entry.ListKey,
                Value = entry.Value,
                Label = entry.Label,
                SortOrder = order,
                IsActive = true,
                UpdatedAt = now,
                UpdatedBy = UpdatedBy,
            });
            added++;
        }

        // a renamed code is switched off and merged into its new name; nothing is deleted
        var renamed = 0;
        foreach (var (oldCode, newCode) in Renames)
        {
            var old = await db.ReferenceItems.FirstOrDefaultAsync(r => r.ListKey == ReferenceListKeys.DefectType && r.Value == oldCode && r.MergedInto == null, ct);
            if (old == null) continue;
            old.MergedInto = newCode;
            old.IsActive = false;
            old.UpdatedAt = now;
            old.UpdatedBy = UpdatedBy;
            renamed++;
        }

        if (added + renamed > 0) await db.SaveChangesAsync(ct);
        return added;
    }
}
