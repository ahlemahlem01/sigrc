using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.ActionPlan.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Coficab.ActionPlan.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment? environment = null)
    {
        var provider = configuration["Database:Provider"]
            ?? configuration["DatabaseProvider"]
            ?? "SqlServer";

        var useInMemory = environment?.IsEnvironment("Testing") == true
            || string.Equals(provider, "InMemory", StringComparison.OrdinalIgnoreCase);

        services.AddDbContext<ActionPlanDbContext>(options =>
        {
            if (useInMemory)
                options.UseInMemoryDatabase(configuration["Database:Name"] ?? "ActionPlan_InMemory");
            else
                options.UseSqlServer(Coficab.Auth.API.Data.SqlConnectionResilience.WithDefaults(configuration.GetConnectionString("ActionPlanDb")), sql =>
                {
                    sql.MigrationsHistoryTable("__EFMigrationsHistory", "actionplan");
                    sql.CommandTimeout(60);
                });
        });

        services.AddScoped<IActionPlanRepository, ActionPlanRepository>();
        services.AddScoped<IPlanActionRepository, PlanActionRepository>();
        services.AddScoped<IDepartmentRepository, DepartmentRepository>();
        services.AddScoped<IOrganizationRepository, OrganizationRepository>();

        return services;
    }
}
