namespace Coficab.ActionPlan.API.Controllers;

/// <summary>The organizations the superadmin follows, sent by the console as "id1,id2".</summary>
internal static class OrganizationFilter
{
    /// <summary>The valid ids in the text; null when there are none (every organization).</summary>
    public static IReadOnlyList<Guid>? Parse(string? raw)
    {
        var ids = (raw ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var g) ? g : (Guid?)null)
            .Where(g => g != null).Select(g => g!.Value).Distinct().ToList();
        return ids.Count == 0 ? null : ids;
    }
}
