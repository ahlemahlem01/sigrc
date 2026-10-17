using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>
/// Which organization a claim belongs to. A claim has no organization of its own: it follows the person it is assigned to
/// (their department's organization) and, when it has no assignee or the assignee has no department, the person who created it.
/// A claim neither of them can place is "unattributed".
/// </summary>
public sealed class OrganizationAttribution
{
    private readonly Dictionary<string, Guid> _orgByUser;

    private OrganizationAttribution(Dictionary<string, Guid> orgByUser) => _orgByUser = orgByUser;

    public static async Task<OrganizationAttribution> LoadAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var rows = await db.UserProfiles.AsNoTracking()
            .Where(p => p.DepartmentId != null && p.Department != null)
            .Select(p => new { p.UserId, Org = p.Department!.OrganizationId })
            .ToListAsync(ct);
        var map = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in rows) map.TryAdd(r.UserId, r.Org);
        return new OrganizationAttribution(map);
    }

    public int Employees(Guid organizationId) => _orgByUser.Values.Count(o => o == organizationId);

    public Guid? Of(string? assignedToId, string? createdById)
    {
        if (!string.IsNullOrWhiteSpace(assignedToId) && _orgByUser.TryGetValue(assignedToId, out var a)) return a;
        if (!string.IsNullOrWhiteSpace(createdById) && _orgByUser.TryGetValue(createdById, out var c)) return c;
        return null;
    }
}
