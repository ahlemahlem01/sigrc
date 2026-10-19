namespace Coficab.ActionPlan.API.Controllers;

/// <summary>The organizations the superadmin follows, sent by the console as "id1,id2".</summary>
internal static class OrganizationFilter
{
    /// <summary>The user ids of the people whose department belongs to the organizations; null when no organization is selected.</summary>
    public static async Task<HashSet<string>?> UserIdsAsync(Application.Interfaces.IApplicationDbContext db, string? raw, CancellationToken ct)
    {
        if (Parse(raw) is not { } orgs) return null;
        var ids = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
            db.UserProfiles.Where(p => p.Department != null && orgs.Contains(p.Department.OrganizationId)).Select(p => p.UserId), ct);
        return new HashSet<string>(ids, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>The valid ids in the text; null when there are none (every organization).</summary>
    public static IReadOnlyList<Guid>? Parse(string? raw)
    {
        var ids = (raw ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var g) ? g : (Guid?)null)
            .Where(g => g != null).Select(g => g!.Value).Distinct().ToList();
        return ids.Count == 0 ? null : ids;
    }
}
