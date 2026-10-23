using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses;

/// <summary>
/// Limits claims to the organizations the superadmin follows. A claim follows the organization of the person it is
/// assigned to and, when that person has none or nobody is assigned, the one of its creator (as in the overview).
/// </summary>
public static class ClaimOrganizations
{
    /// <summary>"id1,id2" as sent by the console; null when empty or invalid (every organization).</summary>
    public static IReadOnlyList<Guid>? Parse(string? raw)
    {
        var ids = (raw ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var g) ? g : (Guid?)null).Where(g => g != null).Select(g => g!.Value).Distinct().ToList();
        return ids.Count == 0 ? null : ids;
    }

    public static async Task<IQueryable<Claim>> ApplyAsync(IApplicationDbContext context, IQueryable<Claim> query, IReadOnlyList<Guid> organizationIds, CancellationToken ct, Guid? departmentId = null)
    {
        var placed = context.UserProfiles.AsNoTracking().Where(p => p.DepartmentId != null && p.Department != null);
        var inScope = await placed.Where(p => organizationIds.Contains(p.Department!.OrganizationId) && (departmentId == null || p.DepartmentId == departmentId)).Select(p => p.UserId).ToListAsync(ct);
        var everyPlaced = await placed.Select(p => p.UserId).ToListAsync(ct);
        return query.Where(c =>
            (c.AssignedToId != null && inScope.Contains(c.AssignedToId))
            || ((c.AssignedToId == null || !everyPlaced.Contains(c.AssignedToId)) && c.CreatedById != null && inScope.Contains(c.CreatedById)));
    }
}
