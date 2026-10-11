using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;

namespace Coficab.Auth.API.Data;

/// <summary>Whether the startup migration and seed have completed (read by /health/ready).</summary>
public sealed class SeedState
{
    public volatile bool Ready;
    public volatile string? LastError;
}

/// <summary>
/// Migrates and seeds the authentication database in the background, retrying while the database is unreachable
/// (container still booting, serverless database waking up), so the API starts listening immediately.
/// </summary>
public class SeedWorker : BackgroundService
{
    private readonly IServiceProvider _services;

    private readonly SeedState _state;
    private readonly ILogger<SeedWorker> _logger;

    public SeedWorker(IServiceProvider services, SeedState state, ILogger<SeedWorker> logger)
    {
        _services = services;
        _state = state;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var delay = TimeSpan.FromSeconds(5);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await SeedAsync(ct);
                _state.Ready = true;
                _state.LastError = null;
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _state.LastError = ex.GetBaseException().Message;
                _logger.LogWarning("Startup migration/seed not done yet ({Error}); retrying in {Delay}", _state.LastError, delay);
                try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { return; }
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 60));
            }
        }
    }

    private async Task SeedAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync(ct);

        // Seed roles
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        string[] roles = ["superadmin", "admin", "user"];
        foreach (var role in roles)
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));

        var env = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();

        // Seed passwords come from configuration (Seed:SuperAdminPassword, Seed:AdminPassword).
        // The literals are Development defaults only; elsewhere a missing value skips the account.
        string? SeedPassword(string key, string developmentDefault) =>
            config[$"Seed:{key}"] is { Length: > 0 } configured ? configured
            : env.IsDevelopment() ? developmentDefault
            : null;

        // Seed superadmin user
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var superAdminPassword = SeedPassword("SuperAdminPassword", "SuperAdmin@1234");
        if (superAdminPassword != null && await userManager.FindByEmailAsync("superadmin@coficab.com") == null)
        {
            var user = new ApplicationUser
            {
                UserName = "superadmin@coficab.com",
                Email = "superadmin@coficab.com",
                FullName = "Super Admin Coficab",
                Department = "IT"
            };
            await userManager.CreateAsync(user, superAdminPassword);
            await userManager.AddToRoleAsync(user, "superadmin");
        }

        // Seed admin user
        var adminPassword = SeedPassword("AdminPassword", "Admin@1234");
        if (adminPassword != null && await userManager.FindByEmailAsync("admin@coficab.com") == null)
        {
            var user = new ApplicationUser
            {
                UserName = "admin@coficab.com",
                Email = "admin@coficab.com",
                FullName = "Admin Coficab",
                Department = "IT"
            };
            await userManager.CreateAsync(user, adminPassword);
            await userManager.AddToRoleAsync(user, "admin");
        }

        // Seed default permissions per app
        var defaultPermissions = new List<Permission>
        {
            // Action Plan App
            new() { Name = "action_plan:view", DisplayName = "View Action Plans", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "action_plan:create", DisplayName = "Create Action Plans", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "action_plan:edit", DisplayName = "Edit Action Plans", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "action_plan:delete", DisplayName = "Delete Action Plans", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "action_plan:approve", DisplayName = "Approve Action Plans", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "action_plan:export", DisplayName = "Export Action Plans", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "data:import", DisplayName = "Importer des données", AppId = "action-plan-app", IsDefault = false },

            // Maintenance App
            new() { Name = "maintenance:view", DisplayName = "View Maintenance", AppId = "maintenance-app", IsDefault = true },
            new() { Name = "maintenance:create", DisplayName = "Create Maintenance", AppId = "maintenance-app", IsDefault = true },
            new() { Name = "maintenance:close", DisplayName = "Close Maintenance", AppId = "maintenance-app", IsDefault = true },

            // HR App
            new() { Name = "hr:view", DisplayName = "View HR", AppId = "hr-app", IsDefault = true },
            new() { Name = "hr:manage_employees", DisplayName = "Manage Employees", AppId = "hr-app", IsDefault = true },

            // Réclamations
            new() { Name = "claims:create", DisplayName = "Créer une réclamation", Description = "Enregistrer une nouvelle réclamation client.", Category = "Claims", AppId = "claims-app", IsDefault = true },
            new() { Name = "claims:view_own", DisplayName = "Voir ses réclamations", Description = "Consulter uniquement les réclamations liées à son compte.", Category = "Claims", AppId = "claims-app", IsDefault = true },
            new() { Name = "claims:view_all", DisplayName = "Voir toutes les réclamations", Description = "Consulter l'ensemble des réclamations du groupe.", Category = "Claims", AppId = "claims-app", IsDefault = true },
            new() { Name = "claims:assign", DisplayName = "Assigner une réclamation", Description = "Désigner la personne qui traite une réclamation.", Category = "Claims", AppId = "claims-app", IsDefault = true },
            new() { Name = "claims:close", DisplayName = "Clôturer une réclamation", Description = "Clôturer une réclamation traitée.", Category = "Claims", AppId = "claims-app", IsDefault = true },
            new() { Name = "claims:import", DisplayName = "Importer des réclamations", Description = "Charger un fichier de réclamations.", Category = "Claims", AppId = "claims-app", IsDefault = true },

            // Plans d'action
            new() { Name = "capa:create", DisplayName = "Créer un plan d'action", Description = "Ouvrir un nouveau plan d'action.", Category = "CAPA", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "capa:assign", DisplayName = "Assigner un plan d'action", Description = "Désigner le responsable d'un plan d'action.", Category = "CAPA", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "capa:validate", DisplayName = "Valider un plan d'action", Description = "Accepter ou refuser un plan d'action.", Category = "CAPA", AppId = "action-plan-app", IsDefault = true },
            new() { Name = "capa:archive", DisplayName = "Archiver un plan d'action", Description = "Ranger un plan d'action terminé dans les archives.", Category = "CAPA", AppId = "action-plan-app", IsDefault = true },

            // Analyses qualité
            new() { Name = "analysis:conduct", DisplayName = "Réaliser une analyse qualité", Description = "Mener l'analyse qualité d'un dossier.", Category = "Quality", AppId = "quality-app", IsDefault = true },
            new() { Name = "analysis:generate_ai", DisplayName = "Générer une synthèse IA", Description = "Produire une synthèse rédigée par l'assistant.", Category = "Quality", AppId = "quality-app", IsDefault = true },
            new() { Name = "8d:complete_steps", DisplayName = "Compléter les étapes 8D", Description = "Renseigner les étapes du dossier 8D.", Category = "Quality", AppId = "quality-app", IsDefault = true },

            // Alertes
            new() { Name = "alerts:view", DisplayName = "Voir les alertes", Description = "Consulter les alertes qualité.", Category = "Alerts", AppId = "alerts-app", IsDefault = true },
            new() { Name = "alerts:propose_action", DisplayName = "Proposer une action corrective", Description = "Proposer une action corrective sur une alerte.", Category = "Alerts", AppId = "alerts-app", IsDefault = true },
            new() { Name = "alerts:validate", DisplayName = "Valider une proposition d'alerte", Description = "Accepter ou refuser une proposition liée à une alerte.", Category = "Alerts", AppId = "alerts-app", IsDefault = true },
            new() { Name = "alerts:resolve", DisplayName = "Résoudre une alerte", Description = "Marquer une alerte comme résolue.", Category = "Alerts", AppId = "alerts-app", IsDefault = true },

            // Employés
            new() { Name = "employees:manage", DisplayName = "Gérer les employés", Description = "Créer et mettre à jour les comptes employés.", Category = "Employees", AppId = "employees-app", IsDefault = true },
            new() { Name = "employees:view_performance", DisplayName = "Voir la performance des employés", Description = "Consulter les indicateurs de performance.", Category = "Employees", AppId = "employees-app", IsDefault = true },
            new() { Name = "employees:generate_hr_report", DisplayName = "Générer un rapport RH", Description = "Produire un rapport des équipes.", Category = "Employees", AppId = "employees-app", IsDefault = true },
            new() { Name = "employees:award_badge", DisplayName = "Attribuer un badge", Description = "Décerner un badge à un employé.", Category = "Employees", AppId = "employees-app", IsDefault = true },

            // Rapports
            new() { Name = "reports:view_dashboard", DisplayName = "Voir le dashboard global", Description = "Consulter le tableau de bord global.", Category = "Reports", AppId = "reports-app", IsDefault = true },
            new() { Name = "reports:export", DisplayName = "Exporter des rapports", Description = "Télécharger les rapports.", Category = "Reports", AppId = "reports-app", IsDefault = true },

            // Administration
            new() { Name = "admin:manage_permissions", DisplayName = "Gérer les permissions", Description = "Créer et attribuer les droits d'accès.", Category = "Admin", AppId = "admin-app", IsDefault = true },
            new() { Name = "admin:manage_process", DisplayName = "Gérer les processus", Description = "Configurer les processus qualité.", Category = "Admin", AppId = "admin-app", IsDefault = true },
            new() { Name = "admin:manage_departments", DisplayName = "Gérer les départements", Description = "Créer et organiser les départements.", Category = "Admin", AppId = "admin-app", IsDefault = true },
        };

        foreach (var permission in defaultPermissions)
        {
            if (!await db.Permissions.AnyAsync(p => p.Name == permission.Name, ct))
                await db.Permissions.AddAsync(permission, ct);
        }

        var unsupported = await db.Permissions
            .Where(p => p.IsActive)
            .ToListAsync(ct);
        foreach (var permission in unsupported.Where(p => !ProjectPermissionCatalog.IsSupported(p.Name)))
            permission.IsActive = false;

        await db.SaveChangesAsync(ct);

        var appManager = scope.ServiceProvider.GetRequiredService<IOpenIddictApplicationManager>();

        string[] userClientPermissions =
        {
            OpenIddictConstants.Permissions.Endpoints.Token,
            OpenIddictConstants.Permissions.GrantTypes.Password,
            OpenIddictConstants.Permissions.GrantTypes.RefreshToken,
            OpenIddictConstants.Permissions.Scopes.Email,
            OpenIddictConstants.Permissions.Scopes.Profile,
            OpenIddictConstants.Permissions.Scopes.Roles,
            OpenIddictConstants.Permissions.ResponseTypes.Token,
            "scp:openid",
            "scp:offline_access",
            "scp:action-plan-api",
        };

        // Update in place: deleting a client also deletes every token issued to it,
        // which would sign everyone out on each restart or deploy.
        async Task UpsertClientAsync(OpenIddictApplicationDescriptor descriptor)
        {
            var existing = await appManager.FindByClientIdAsync(descriptor.ClientId!, ct);
            if (existing == null)
                await appManager.CreateAsync(descriptor, ct);
            else
                await appManager.UpdateAsync(existing, descriptor, ct);
        }

        // Browser client: public, so no secret ships in the JavaScript bundle.
        var frontend = new OpenIddictApplicationDescriptor
        {
            ClientId = "coficab-frontend",
            ClientType = OpenIddictConstants.ClientTypes.Public,
            DisplayName = "Coficab Frontend",
        };
        frontend.Permissions.UnionWith(userClientPermissions);
        await UpsertClientAsync(frontend);

        // Postman client with a known secret: Development only, removed elsewhere.
        if (env.IsDevelopment())
        {
            var postman = new OpenIddictApplicationDescriptor
            {
                ClientId = "postman-test",
                ClientSecret = "postman-secret",
                ClientType = OpenIddictConstants.ClientTypes.Confidential,
                DisplayName = "Postman Test Client",
            };
            postman.Permissions.UnionWith(userClientPermissions);
            postman.Permissions.Add(OpenIddictConstants.Permissions.Endpoints.Introspection);
            await UpsertClientAsync(postman);
        }
        else if (await appManager.FindByClientIdAsync("postman-test", ct) is { } postmanOutsideDev)
        {
            await appManager.DeleteAsync(postmanOutsideDev, ct);
        }

        // ActionPlan API client (token introspection)
        var actionPlanApi = new OpenIddictApplicationDescriptor
        {
            ClientId = "coficab-action-plan-api",
            ClientSecret = "action-plan-secret",
            ClientType = OpenIddictConstants.ClientTypes.Confidential,
            DisplayName = "Coficab Action Plan API",
        };
        actionPlanApi.Permissions.Add(OpenIddictConstants.Permissions.Endpoints.Introspection);
        await UpsertClientAsync(actionPlanApi);
    }


}