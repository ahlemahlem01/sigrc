namespace Coficab.Auth.API.Data;

/// <summary>
/// The rights a role carries by itself, so that the permission matrix shows what each person can really do.
/// Administrators and super administrators hold every right of the catalog. An employee holds the rights of the daily work
/// (claims, analyses, 8D steps, alerts); any other right is granted to them one by one, from the matrix.
/// Role rights are not rows of the database: a right granted from the matrix is added to them, never removed.
/// </summary>
public static class RolePermissionDefaults
{
    private static readonly string[] Employee =
    {
        "claims:create",
        "claims:view_own",
        "analysis:conduct",
        "8d:complete_steps",
        "alerts:view",
        "alerts:propose_action",
    };

    public static IReadOnlyCollection<string> For(IEnumerable<string> roles)
    {
        var set = roles.Select(r => (r ?? string.Empty).Trim().ToLowerInvariant()).ToHashSet();
        if (set.Contains("admin") || set.Contains("superadmin"))
            return ProjectPermissionCatalog.Names.OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToArray();
        return Employee;
    }
}
