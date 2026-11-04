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

    /// <summary>Every code the application knows, with its label for the Functions screen.</summary>
    public static readonly IReadOnlyList<(string Code, string Label)> Catalog = new[]
    {
        (ValidateEightD, "Valider et clôturer un dossier 8D"),
        (ValidateFiveWhy, "Valider une analyse 5 Pourquoi"),
        (ExtendDeadline, "Prolonger une échéance"),
        (Reassign, "Réassigner un plan ou une action"),
    };

    /// <summary>
    /// The right, from the role, from a permission granted one by one, or from a function the person holds
    /// (the specification: a user's rights follow his function).
    /// </summary>
    public static async Task<bool> HasAsync(ClaimsPrincipal user, IServiceProvider services, string permission, CancellationToken ct = default)
    {
        if (Has(user, permission)) return true;
        var id = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("sub")?.Value;
        if (string.IsNullOrWhiteSpace(id)) return false;

        var db = services.GetRequiredService<Coficab.ActionPlan.Infrastructure.Data.ActionPlanDbContext>();
        var granted = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
            Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.AsNoTracking(db.UserFunctions)
                .Where(uf => uf.UserId == id && uf.Status != Coficab.ActionPlan.Core.Enums.FunctionStatus.NotActive && uf.Function.Permissions != null)
                .Select(uf => uf.Function.Permissions!), ct);
        return granted.Any(list => list.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Contains(permission, StringComparer.OrdinalIgnoreCase));
    }

    public static bool Has(ClaimsPrincipal user, string permission)
    {
        var roles = user.FindAll("role").Concat(user.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .ToHashSet();
        if (roles.Contains("admin") || roles.Contains("superadmin")) return true;
        return user.FindAll("permission").Any(c => string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase));
    }
}
