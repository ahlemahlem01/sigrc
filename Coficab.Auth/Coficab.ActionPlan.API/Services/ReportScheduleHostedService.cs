using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>Runs the scheduled reports: each one that is due saves a report that the administrators can open.</summary>
public class ReportScheduleHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ReportScheduleHostedService> _logger;

    public ReportScheduleHostedService(IServiceScopeFactory scopeFactory, ILogger<ReportScheduleHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(40), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
                var due = await db.ReportSchedules
                    .Where(s => s.IsActive && !s.IsArchived && s.NextRunAt <= DateTime.UtcNow)
                    .ToListAsync(stoppingToken);
                foreach (var schedule in due)
                    await RunAsync(db, schedule, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Échec de la vérification des rapports programmés");
            }

            try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>Generates and saves the report of a schedule, then sets its next run. Used by the timer and by "run now".</summary>
    public static async Task<SavedReport?> RunAsync(ActionPlanDbContext db, ReportSchedule schedule, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        try
        {
            var (result, criteriaJson, count) = schedule.Kind == "capa-actions"
                ? await CapaActionsReportGenerator.GenerateAsync(
                    db, CapaActionsReportGenerator.ParseCriteria(schedule.CriteriaJson), schedule.PeriodDays, now, schedule.OrganizationIds, ct)
                : await ClaimsReportGenerator.GenerateAsync(
                    db, ClaimsReportGenerator.ParseCriteria(schedule.CriteriaJson), schedule.PeriodDays, now, schedule.OrganizationIds, ct);
            var report = new SavedReport
            {
                Kind = schedule.Kind,
                Title = $"{schedule.Title} — {(now + TimeSpan.FromHours(1)):yyyy-MM-dd HH:mm}",
                CriteriaJson = criteriaJson,
                ResultJson = result,
                ItemCount = count,
                CreatedBy = "system",
                CreatedByName = null,
            };
            db.SavedReports.Add(report);
            schedule.LastReportId = report.Id;
            schedule.LastError = null;
            schedule.LastRunAt = now;
            schedule.NextRunAt = ReportScheduling.NextRun(schedule, now);
            await db.SaveChangesAsync(ct);
            return report;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            schedule.LastError = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
            schedule.LastRunAt = now;
            // try again at the next occurrence, not in a loop every 5 minutes
            schedule.NextRunAt = ReportScheduling.NextRun(schedule, now);
            await db.SaveChangesAsync(ct);
            return null;
        }
    }
}
