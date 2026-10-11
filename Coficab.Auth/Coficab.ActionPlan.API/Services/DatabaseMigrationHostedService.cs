using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Applies the pending migrations of the action plan database at startup, in the background, retrying while the
/// database is unreachable (container still booting, serverless database waking up). Skipped for non-SQL Server
/// providers (tests). Disable with Database:AutoMigrate=false.
/// </summary>
public class DatabaseMigrationHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DatabaseMigrationHostedService> _logger;

    public DatabaseMigrationHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<DatabaseMigrationHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!_configuration.GetValue("Database:AutoMigrate", true)) return;

        var delay = TimeSpan.FromSeconds(5);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
                if (!db.Database.IsSqlServer()) return;
                await db.Database.MigrateAsync(ct);
                _logger.LogInformation("Action plan database is up to date");
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning("Action plan migration not done yet ({Error}); retrying in {Delay}", ex.GetBaseException().Message, delay);
                try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { return; }
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 60));
            }
        }
    }
}
