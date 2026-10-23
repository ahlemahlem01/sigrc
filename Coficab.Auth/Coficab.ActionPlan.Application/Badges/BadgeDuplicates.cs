using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Badges;

/// <summary>
/// The same badge must be counted and shown once per person: the award rule is one badge per category and name (the plan it
/// came from does not make it a second one). Rows written twice (concurrent awards, the former per-plan awards, or the older
/// "performance-xxx" / "xxx" spellings of the same recognition goal) stay in the database; only the earliest one is read.
/// A recognition goal that says the same as a badge of the engine is not shown next to it.
/// </summary>
public static class BadgeDuplicates
{
    private static readonly HashSet<string> RecognitionGoals = new(StringComparer.OrdinalIgnoreCase)
    {
        "first-plan", "triple-completion", "on-track", "fast-completer", "perfectionist", "no-overdue", "active-juggler",
    };

    /// <summary>The recognition goal behind a badge (the "performance-" spelling is the same goal), or null for the engine's badges.</summary>
    public static string? RecognitionGoal(Badge b)
    {
        var category = (b.Category ?? string.Empty).Trim().ToLowerInvariant();
        if (category.StartsWith("performance-")) category = category["performance-".Length..];
        return RecognitionGoals.Contains(category) ? category : null;
    }

    public static List<Badge> Distinct(IEnumerable<Badge> badges)
    {
        var kept = badges
            .GroupBy(b => (
                User: (b.UserId ?? string.Empty).ToLowerInvariant(),
                Category: RecognitionGoal(b) is { } goal ? "goal:" + goal : b.Category,
                Name: RecognitionGoal(b) is null ? b.Name : string.Empty))
            .Select(g => g.OrderBy(b => b.EarnedAt).First())
            .ToList();

        // "First plan" and "finished a plan before its deadline" are already given by the engine ("Premier plan CAPA", "CAPA dans les délais").
        bool Has(string user, Func<Badge, bool> engineBadge) =>
            kept.Any(e => RecognitionGoal(e) is null && string.Equals(e.UserId, user, StringComparison.OrdinalIgnoreCase) && engineBadge(e));

        return kept
            .Where(b => RecognitionGoal(b) switch
            {
                "first-plan" => !Has(b.UserId, e => e.Category == "first_plan"),
                "fast-completer" => !Has(b.UserId, e => e.Category == "speed" && e.Name == "CAPA dans les délais"),
                _ => true,
            })
            .OrderByDescending(b => b.EarnedAt)
            .ToList();
    }
}
