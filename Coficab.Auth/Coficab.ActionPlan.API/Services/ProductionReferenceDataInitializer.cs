using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Completes the reference lists with the production master data (visual-inspection defect codes and direct customer
/// sites) once the database schema is up to date. Idempotent: only missing entries are added, existing values and the
/// claims that use them are never modified. Skipped for non-SQL Server providers; disable with ReferenceData:AutoInitialize=false.
/// </summary>
public class ProductionReferenceDataInitializer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ProductionReferenceDataInitializer> _logger;

    public ProductionReferenceDataInitializer(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<ProductionReferenceDataInitializer> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!_configuration.GetValue("ReferenceData:AutoInitialize", true)) return;

        var delay = TimeSpan.FromSeconds(5);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
                if (!db.Database.IsSqlServer()) return;

                if ((await db.Database.GetPendingMigrationsAsync(ct)).Any())
                {
                    await Task.Delay(delay, ct);
                    continue;
                }

                var added = await ProductionReferenceData.EnsureAsync(db, ct);
                _logger.LogInformation("Reference data checked: {Added} entries added", added);
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning("Reference data not initialised yet ({Error}); retrying in {Delay}", ex.GetBaseException().Message, delay);
                try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { return; }
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 60));
            }
        }
    }
}
