using Coficab.ActionPlan.Application.Interfaces;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Recalcule quotidiennement les statuts d'activité employés.
/// </summary>
public class EmployeeActivityHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EmployeeActivityHostedService> _logger;

    public EmployeeActivityHostedService(
        IServiceScopeFactory scopeFactory,
        ILogger<EmployeeActivityHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(25), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<IEmployeeActivityService>();
                var summary = await svc.RecalculateAllAsync(stoppingToken);
                _logger.LogInformation(
                    "Activity status recalculated: {Total} employees (Active={Active}, Low={Low}, Inactive={Inactive})",
                    summary.Total, summary.Active, summary.LowActivity, summary.Inactive);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Échec du recalcul quotidien des statuts d'activité");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
