using System.Security.Claims;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// A right of the permission matrix: held by administrators and super administrators through their role, or granted to
/// someone one by one (it then travels in their token as a "permission" claim).
/// </summary>
public static class PermissionAccess
{
    public const string ExtendDeadline = "capa:extend_deadline";
    public const string Reassign = "capa:reassign";
    public const string ValidateFiveWhy = "analysis:validate_fivewhy";
    public const string ValidateEightD = "8d:validate";

    public static bool Has(ClaimsPrincipal user, string permission)
    {
        var roles = user.FindAll("role").Concat(user.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .ToHashSet();
        if (roles.Contains("admin") || roles.Contains("superadmin")) return true;
        return user.FindAll("permission").Any(c => string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase));
    }
}
