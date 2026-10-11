using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Coficab.ActionPlan.Infrastructure.Data;

public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ActionPlanDbContext>
{
    private const string ActionPlanApiSecretsId = "9af12337-ee1a-4d83-827c-830205fc3084";

    public ActionPlanDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .AddEnvironmentVariables()
            .AddUserSecrets(ActionPlanApiSecretsId)
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? configuration.GetConnectionString("ActionPlanDb")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__ActionPlanDb");

        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                "ConnectionStrings:DefaultConnection is missing from user secrets. Do not hardcode the password.");

        var optionsBuilder = new DbContextOptionsBuilder<ActionPlanDbContext>();
        optionsBuilder.UseSqlServer(connectionString, sql =>
            sql.MigrationsHistoryTable("__EFMigrationsHistory", "actionplan"));

        return new ActionPlanDbContext(optionsBuilder.Options);
    }
}
