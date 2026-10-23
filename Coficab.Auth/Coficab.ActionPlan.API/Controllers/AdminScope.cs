using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The organization / department an administrator follows on a page (pilotage, deadlines): which claims, plans and people
/// are in view. A department alone implies its organization.
/// </summary>
internal sealed class AdminScope
{
    public IReadOnlyList<Guid>? Organizations { get; private init; }
    public Guid? DepartmentId { get; private init; }

    /// <summary>The user ids of the people of the scope; null when nothing restricts the view.</summary>
    public HashSet<string>? Users { get; private init; }

    public bool Restricts => Organizations != null || DepartmentId != null;

    public static async Task<AdminScope> ResolveAsync(IApplicationDbContext db, string? organizationIds, Guid? departmentId, CancellationToken ct)
    {
        var orgs = OrganizationFilter.Parse(organizationIds);
        if (departmentId is { } wanted && orgs == null)
        {
            var org = await db.Departments.AsNoTracking().Where(d => d.Id == wanted).Select(d => (Guid?)d.OrganizationId).FirstOrDefaultAsync(ct);
            if (org != null) orgs = new[] { org.Value };
        }

        HashSet<string>? users = null;
        if (orgs != null || departmentId != null)
        {
            var people = db.UserProfiles.AsNoTracking().Where(u => u.Department != null);
            if (orgs != null) people = people.Where(u => orgs.Contains(u.Department!.OrganizationId));
            if (departmentId != null) people = people.Where(u => u.DepartmentId == departmentId);
            users = (await people.Select(u => u.UserId).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        }
        return new AdminScope { Organizations = orgs, DepartmentId = departmentId, Users = users };
    }

    /// <summary>Claims (not archived) of the people in scope, or created by them when nobody in scope is assigned.</summary>
    public async Task<IQueryable<Claim>> ClaimsAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var claims = db.Claims.AsNoTracking().Where(c => !c.IsArchived);
        return Organizations != null ? await ClaimOrganizations.ApplyAsync(db, claims, Organizations, ct, DepartmentId) : claims;
    }

    public IQueryable<ActionPlan.Core.Entities.ActionPlan> Plans(IApplicationDbContext db)
    {
        var plans = db.ActionPlans.AsNoTracking().Where(p => !p.IsArchived);
        if (Organizations != null) plans = plans.Where(p => Organizations.Contains(p.OrganizationId));
        if (DepartmentId != null) plans = plans.Where(p => p.DepartmentId == DepartmentId);
        return plans;
    }
}
