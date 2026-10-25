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
    private readonly Dictionary<string, Guid> _departmentByUser;

    private OrganizationAttribution(Dictionary<string, Guid> orgByUser, Dictionary<string, Guid> departmentByUser)
    {
        _orgByUser = orgByUser;
        _departmentByUser = departmentByUser;
    }

    public static async Task<OrganizationAttribution> LoadAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var rows = await db.UserProfiles.AsNoTracking()
            .Where(p => p.DepartmentId != null && p.Department != null)
            .Select(p => new { p.UserId, Org = p.Department!.OrganizationId, Dept = p.DepartmentId!.Value })
            .ToListAsync(ct);
        var map = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var byDepartment = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in rows) { map.TryAdd(r.UserId, r.Org); byDepartment.TryAdd(r.UserId, r.Dept); }
        return new OrganizationAttribution(map, byDepartment);
    }

    public int Employees(Guid organizationId) => _orgByUser.Values.Count(o => o == organizationId);

    public int EmployeesIn(Guid departmentId) => _departmentByUser.Values.Count(d => d == departmentId);

    /// <summary>The department of a claim, by the same rule as the organization: the assignee's, else the creator's.</summary>
    public Guid? DepartmentOf(string? assignedToId, string? createdById)
    {
        if (!string.IsNullOrWhiteSpace(assignedToId) && _departmentByUser.TryGetValue(assignedToId, out var a)) return a;
        if (!string.IsNullOrWhiteSpace(createdById) && _departmentByUser.TryGetValue(createdById, out var c)) return c;
        return null;
    }

    public Guid? Of(string? assignedToId, string? createdById)
    {
        if (!string.IsNullOrWhiteSpace(assignedToId) && _orgByUser.TryGetValue(assignedToId, out var a)) return a;
        if (!string.IsNullOrWhiteSpace(createdById) && _orgByUser.TryGetValue(createdById, out var c)) return c;
        return null;
    }
}
