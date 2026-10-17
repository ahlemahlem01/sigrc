using System.Globalization;
using System.Text;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.ReferenceLists;

/// <summary>
/// Maps any spelling of a defect type to the one the administrator kept ("Étiquette manquante" for
/// "etiquette manquante", "ETIQUETTE  MANQUANTE"...). Used when a claim is saved (new claims store the kept name)
/// and when statistics are built (old claims keep their original text but are counted under the kept name).
/// Nothing is ever rewritten or deleted: merging only records an alias.
/// </summary>
public sealed class DefectTypeResolver
{
    private readonly Dictionary<string, string> _alias;
    private readonly Dictionary<string, string> _listed;
    private readonly Dictionary<string, string> _byKey;

    private DefectTypeResolver(Dictionary<string, string> alias, Dictionary<string, string> listed, Dictionary<string, string> byKey)
    {
        _alias = alias;
        _listed = listed;
        _byKey = byKey;
    }

    public static DefectTypeResolver Empty { get; } = new(new(), new(), new());

    /// <summary>Same words once case, accents, punctuation and repeated spaces are ignored.</summary>
    public static string Key(string? text)
    {
        var decomposed = (text ?? string.Empty).Trim().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        var pendingSpace = false;
        foreach (var ch in decomposed)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(ch))
            {
                if (pendingSpace && sb.Length > 0) sb.Append(' ');
                pendingSpace = false;
                sb.Append(char.ToLowerInvariant(ch));
            }
            else pendingSpace = true;
        }
        return sb.ToString();
    }

    public static async Task<DefectTypeResolver> LoadAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var items = await db.ReferenceItems.AsNoTracking()
            .Where(r => r.ListKey == ReferenceListKeys.DefectType)
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Value)
            .ToListAsync(ct);
        return From(items);
    }

    public static DefectTypeResolver From(IEnumerable<ReferenceItem> items)
    {
        var all = items.ToList();
        var alias = new Dictionary<string, string>();
        var listed = new Dictionary<string, string>();
        var byKey = new Dictionary<string, string>();

        foreach (var item in all.Where(i => !string.IsNullOrWhiteSpace(i.MergedInto)))
            alias[item.Value.Trim().ToLowerInvariant()] = item.MergedInto!.Trim();

        foreach (var item in all.Where(i => string.IsNullOrWhiteSpace(i.MergedInto)))
        {
            listed.TryAdd(item.Value.Trim().ToLowerInvariant(), item.Value.Trim());
            if (item.IsActive) byKey.TryAdd(Key(item.Value), item.Value.Trim());
        }

        return new DefectTypeResolver(alias, listed, byKey);
    }

    public string Resolve(string? text)
    {
        var trimmed = (text ?? string.Empty).Trim();
        if (trimmed.Length == 0) return trimmed;

        // Explicit merge (followed a few hops in case a kept name was itself merged later).
        var current = trimmed;
        for (var hop = 0; hop < 5 && _alias.TryGetValue(current.ToLowerInvariant(), out var target); hop++)
            current = target;
        if (!ReferenceEquals(current, trimmed) && !string.Equals(current, trimmed, StringComparison.Ordinal)) return Canonical(current);

        // A listed name keeps the spelling of the list.
        if (_listed.TryGetValue(trimmed.ToLowerInvariant(), out var listedValue)) return listedValue;

        // Free text that only differs by case, accents or spacing from an active listed name.
        var key = Key(trimmed);
        return key.Length > 0 && _byKey.TryGetValue(key, out var byKey) ? byKey : trimmed;
    }

    /// <summary>
    /// Is this (already resolved) name one of the administrator's listed defect types? With no list at all every name is
    /// accepted. Used to keep a free-text spelling from showing up as a "new" defect in the trends.
    /// </summary>
    public bool IsKnown(string? resolved) =>
        _listed.Count == 0 || (!string.IsNullOrWhiteSpace(resolved) && _listed.ContainsKey(resolved.Trim().ToLowerInvariant()));

    private string Canonical(string value) => _listed.TryGetValue(value.ToLowerInvariant(), out var listedValue) ? listedValue : value;
}
