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
        // Visual-inspection defect codes
        new Entry(ReferenceListKeys.DefectType, "CUT_INSULATION", "Coupure / Entaille sur gaine"),
        new Entry(ReferenceListKeys.DefectType, "COPPER_BLOOMING", "Brins de cuivre cassés / désaffleurants"),
        new Entry(ReferenceListKeys.DefectType, "MARKING_DEFECT", "Défaut de marquage (illisible / absent)"),
        new Entry(ReferenceListKeys.DefectType, "SPOOL_DAMAGE", "Touret / Emballage endommagé"),
        new Entry(ReferenceListKeys.DefectType, "COLOR_MISMATCH", "Couleur d'isolant non conforme"),

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

        if (added > 0) await db.SaveChangesAsync(ct);
        return added;
    }
}
