namespace Coficab.Auth.API.Data;

/// <summary>
/// Droits qui correspondent à une fonction réellement présente dans le projet.
/// La maintenance et les anciens codes hors écran en sont exclus.
/// </summary>
public static class ProjectPermissionCatalog
{
    public const string RejectionMessage =
        "Ce droit ne correspond à aucune fonctionnalité du projet. La maintenance, par exemple, n'est pas disponible. Seuls les droits des réclamations, plans d'action, analyses qualité, alertes, employés, rapports et administration peuvent être enregistrés.";

    public static readonly HashSet<string> Names = new(StringComparer.OrdinalIgnoreCase)
    {
        "data:import",
        "claims:create",
        "claims:view_own",
        "claims:view_all",
        "claims:assign",
        "claims:close",
        "claims:import",
        "capa:create",
        "capa:assign",
        "capa:validate",
        "capa:archive",
        "capa:extend_deadline",
        "capa:reassign",
        "analysis:conduct",
        "analysis:generate_ai",
        "assistant:unrestricted",
        "8d:complete_steps",
        "8d:validate",
        "analysis:validate_fivewhy",
        "alerts:view",
        "alerts:propose_action",
        "alerts:validate",
        "alerts:resolve",
        "employees:manage",
        "employees:view_performance",
        "employees:generate_hr_report",
        "employees:award_badge",
        "reports:view_dashboard",
        "reports:export",
        "admin:manage_permissions",
        "admin:manage_process",
        "admin:manage_departments",
    };

    public static bool IsSupported(string? name) =>
        !string.IsNullOrWhiteSpace(name) && Names.Contains(name.Trim());
}
