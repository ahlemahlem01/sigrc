using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.ReferenceLists;

/// <summary>
/// Same value written in different ways (customer, production line, shift): "Leoni", "LEONI", "Léoni ", "Leoni."
/// Two levels: an exact one (same words once case, accents, punctuation and spaces are ignored: <see cref="Same"/>) which decides what is
/// counted together, and a fuzzy one (TF-IDF of character trigrams compared by cosine similarity: <see cref="Similar"/>) which only
/// SUGGESTS a close value ("Leonii", "Leoni Wiring") and never merges anything by itself.
/// </summary>
public static class TextSimilarity
{
    public const double DefaultThreshold = 0.6;

    public static string Key(string? text) => DefectTypeResolver.Key(text);

    public static bool Same(string? a, string? b) => Key(a) == Key(b) && Key(a).Length > 0;

    /// <summary>The spellings stored for the same value as <paramref name="chosen"/> (itself included), to filter on all of them.</summary>
    public static async Task<List<string>> VariantsAsync(IQueryable<string?> stored, string? chosen, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(chosen)) return [];
        var distinct = await stored.Where(v => v != null && v != "").Distinct().Take(5000).ToListAsync(ct);
        var variants = distinct.Where(v => Same(v, chosen)).Select(v => v!).ToList();
        if (!variants.Contains(chosen)) variants.Add(chosen);
        return variants;
    }

    /// <summary>One entry per value once the spellings are merged, keeping the most frequent spelling as its label.</summary>
    public static List<string> Merged(IEnumerable<string> values) =>
        values.Where(v => !string.IsNullOrWhiteSpace(v))
            .GroupBy(Key)
            .Select(g => g.GroupBy(v => v).OrderByDescending(x => x.Count()).ThenBy(x => x.Key, StringComparer.Ordinal).First().Key)
            .OrderBy(v => v, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static bool StartsWithWords(string longer, string shorter) =>
        shorter.Length >= 3 && longer.Length > shorter.Length && longer.StartsWith(shorter + " ", StringComparison.Ordinal);

    private static Dictionary<string, int> Trigrams(string key)
    {
        var padded = $"  {key} ";
        var counts = new Dictionary<string, int>();
        for (var i = 0; i + 3 <= padded.Length; i++)
        {
            var gram = padded.Substring(i, 3);
            counts[gram] = counts.GetValueOrDefault(gram) + 1;
        }
        return counts;
    }

    /// <summary>The values of <paramref name="corpus"/> close to <paramref name="value"/>, best first (the corpus gives the IDF weights).</summary>
    public static List<(string Value, double Score)> Similar(string? value, IEnumerable<string> corpus, double threshold = DefaultThreshold, int max = 5)
    {
        var key = Key(value);
        if (key.Length == 0) return [];

        var candidates = Merged(corpus);
        var grams = candidates.ToDictionary(c => c, c => Trigrams(Key(c)));
        var query = Trigrams(key);

        var documents = grams.Count + 1;
        var df = new Dictionary<string, int>();
        foreach (var g in grams.Values.Append(query))
            foreach (var gram in g.Keys) df[gram] = df.GetValueOrDefault(gram) + 1;
        double Idf(string gram) => Math.Log((documents + 1.0) / (df[gram] + 1.0)) + 1.0;

        double Norm(Dictionary<string, int> v) => Math.Sqrt(v.Sum(kv => Math.Pow(kv.Value * Idf(kv.Key), 2)));
        var queryNorm = Norm(query);

        var scored = new List<(string Value, double Score)>();
        foreach (var (candidate, vector) in grams)
        {
            if (Key(candidate) == key) { scored.Add((candidate, 1.0)); continue; }
            var dot = query.Where(kv => vector.ContainsKey(kv.Key)).Sum(kv => kv.Value * vector[kv.Key] * Math.Pow(Idf(kv.Key), 2));
            var denominator = queryNorm * Norm(vector);
            var score = denominator == 0 ? 0 : dot / denominator;
            // "Leoni" and "Leoni Wiring Systems": the shorter one is the beginning of the longer one, word for word
            if (StartsWithWords(Key(candidate), key) || StartsWithWords(key, Key(candidate))) score = Math.Max(score, 0.8);
            if (score >= threshold) scored.Add((candidate, Math.Round(score, 3)));
        }
        return scored.OrderByDescending(s => s.Score).ThenBy(s => s.Value, StringComparer.OrdinalIgnoreCase).Take(max).ToList();
    }
}
