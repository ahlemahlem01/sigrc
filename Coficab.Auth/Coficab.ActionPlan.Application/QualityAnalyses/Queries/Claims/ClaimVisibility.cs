using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

/// <summary>
/// SuperAdmin sees every claim. An admin sees claims they created, claims
/// assigned to them, claims of colleagues in their department, and claims
/// tied to an action plan of that department.
/// </summary>
public static class ClaimVisibility
{
    public static async Task<IQueryable<Claim>> ApplyAsync(
        IApplicationDbContext db,
        IQueryable<Claim> query,
        string userId,
        CancellationToken cancellationToken)
    {
        var uid = userId.Trim().ToLowerInvariant();
        var profile = await db.UserProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId.ToLower() == uid, cancellationToken);
        var deptId = profile?.DepartmentId;
        var deptUserIds = deptId == null
            ? new List<string>()
            : await db.UserProfiles.AsNoTracking()
                .Where(p => p.DepartmentId == deptId && p.UserId != "")
                .Select(p => p.UserId.ToLower())
                .ToListAsync(cancellationToken);

        return query.Where(c =>
            (c.CreatedById != null && c.CreatedById.ToLower() == uid)
            || (c.AssignedToId != null && c.AssignedToId.ToLower() == uid)
            || (c.CreatedById != null && deptUserIds.Contains(c.CreatedById.ToLower()))
            || (c.AssignedToId != null && deptUserIds.Contains(c.AssignedToId.ToLower()))
            || (deptId != null && db.ActionPlans.Any(p =>
                p.ClaimId == c.Id && !p.IsArchived && p.DepartmentId == deptId)));
    }

    public static async Task FillAsync(IApplicationDbContext db, IList<Claim> claims, CancellationToken cancellationToken)
    {
        if (claims.Count == 0) return;
        var profiles = await db.UserProfiles.AsNoTracking().Include(p => p.Department).ToListAsync(cancellationToken);
        var departments = await db.Departments.AsNoTracking().ToListAsync(cancellationToken);
        foreach (var claim in claims)
        {
            claim.AssignedToName = PersonName(profiles, claim.AssignedToId, claim.AssignedToName);
            claim.CreatedBy = PersonName(profiles, claim.CreatedById, claim.CreatedBy);
            claim.ProductionLine = PlaceName(departments, claim.ProductionLine);
        }
    }

    public static string PersonName(IEnumerable<UserProfile> profiles, string? userId, string? current)
    {
        if (!string.IsNullOrWhiteSpace(current) && !LooksLikeId(current))
            return current.Trim();
        if (string.IsNullOrWhiteSpace(userId))
            return string.IsNullOrWhiteSpace(current) ? string.Empty : current.Trim();
        var profile = profiles.FirstOrDefault(p => string.Equals(p.UserId, userId, StringComparison.OrdinalIgnoreCase));
        if (profile == null) return "Non assigné";
        if (!string.IsNullOrWhiteSpace(profile.Name) && !LooksLikeId(profile.Name)) return profile.Name.Trim();
        return string.IsNullOrWhiteSpace(profile.Email) ? "Non assigné" : profile.Email;
    }

    public static string? PlaceName(IEnumerable<Department> departments, string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0) return raw;
        var match = departments.FirstOrDefault(d =>
            string.Equals(d.Code, value, StringComparison.OrdinalIgnoreCase)
            || string.Equals(d.Name, value, StringComparison.OrdinalIgnoreCase));
        if (match == null) return value;
        return DepartmentLabel(match);
    }

    public static string DepartmentLabel(Department? department)
    {
        if (department == null) return "—";
        var name = (department.Name ?? string.Empty).Trim();
        var code = (department.Code ?? string.Empty).Trim();
        var description = (department.Description ?? string.Empty).Trim();
        if (IsRawCode(name) && description.Contains(' ')) return description;
        if (name.Length > 0 && !string.Equals(name, code, StringComparison.OrdinalIgnoreCase) && !IsRawCode(name))
            return name;
        if (description.Contains(' ')) return description;
        return name.Length > 0 ? name : code;
    }

    public static bool LooksLikeId(string value)
    {
        var text = value.Trim();
        if (Guid.TryParse(text, out _)) return true;
        return text.Length is >= 8 and <= 36 && text.All(c => char.IsAsciiHexDigit(c) || c == '-');
    }

    private static bool IsRawCode(string value) =>
        value.Length is >= 2 and <= 12
        && !value.Contains(' ')
        && value.All(c => char.IsLetterOrDigit(c) || c is '-' or '_');
}
