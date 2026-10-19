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

    /// <summary>Merged accounts: old user id to the account that replaced it.</summary>
    public static async Task<Dictionary<string, string>> AliasesAsync(IApplicationDbContext db, CancellationToken cancellationToken)
        => await db.UserAliases.AsNoTracking().ToDictionaryAsync(a => a.OldUserId, a => a.UserId, StringComparer.OrdinalIgnoreCase, cancellationToken);

    public static async Task FillAsync(IApplicationDbContext db, IList<Claim> claims, CancellationToken cancellationToken)
    {
        if (claims.Count == 0) return;
        var aliases = await AliasesAsync(db, cancellationToken);
        var profiles = await db.UserProfiles.AsNoTracking().Include(p => p.Department).ToListAsync(cancellationToken);
        var departments = await db.Departments.AsNoTracking().ToListAsync(cancellationToken);
        foreach (var claim in claims)
        {
            claim.AssignedToName = PersonName(profiles, claim.AssignedToId, claim.AssignedToName, aliases);
            claim.CreatedBy = PersonName(profiles, claim.CreatedById, claim.CreatedBy, aliases);
            claim.ProductionLine = PlaceName(departments, claim.ProductionLine);
        }
    }

    /// <summary>
    /// The name of a person: by id (following a merge to the account that replaced it), the profile's current name first,
    /// so a rename or a merge shows everywhere; the text stored with the record is only the fallback.
    /// </summary>
    public static string PersonName(IEnumerable<UserProfile> profiles, string? userId, string? current, IReadOnlyDictionary<string, string>? aliases = null)
    {
        var stored = !string.IsNullOrWhiteSpace(current) && !LooksLikeId(current) ? current.Trim() : null;
        if (string.IsNullOrWhiteSpace(userId))
            return stored ?? (string.IsNullOrWhiteSpace(current) ? string.Empty : current.Trim());

        var id = aliases != null && aliases.TryGetValue(userId, out var replacement) ? replacement : userId;
        var profile = profiles.FirstOrDefault(p => string.Equals(p.UserId, id, StringComparison.OrdinalIgnoreCase));
        if (profile != null && !string.IsNullOrWhiteSpace(profile.Name) && !LooksLikeId(profile.Name)) return profile.Name.Trim();
        if (stored != null) return stored;
        if (profile == null) return "Non assigné";
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
