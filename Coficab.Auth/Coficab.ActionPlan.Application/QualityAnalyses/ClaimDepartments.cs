using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses;

/// <summary>
/// Limits claims to one department. A claim belongs to the department of the person it is assigned to and, when that
/// person has none or nobody is assigned, to the one of its creator (the rule of <see cref="ClaimOrganizations"/>).
/// </summary>
public static class ClaimDepartments
{
    public static async Task<IQueryable<Claim>> ApplyAsync(IApplicationDbContext context, IQueryable<Claim> query, Guid departmentId, CancellationToken ct)
    {
        var placed = context.UserProfiles.AsNoTracking().Where(p => p.DepartmentId != null);
        var inDepartment = await placed.Where(p => p.DepartmentId == departmentId).Select(p => p.UserId).ToListAsync(ct);
        var everyPlaced = await placed.Select(p => p.UserId).ToListAsync(ct);
        return query.Where(c =>
            (c.AssignedToId != null && inDepartment.Contains(c.AssignedToId))
            || ((c.AssignedToId == null || !everyPlaced.Contains(c.AssignedToId)) && c.CreatedById != null && inDepartment.Contains(c.CreatedById)));
    }
}
