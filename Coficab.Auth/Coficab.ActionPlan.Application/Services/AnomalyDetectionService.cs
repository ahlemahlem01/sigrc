using Coficab.ActionPlan.Application.DomainEvents;
using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

/// <summary>
/// Détection d'anomalies : z-score de la dernière semaine vs moyenne / écart-type
/// des 4 semaines précédentes. Seuil : z &gt; 2.5.
/// Publie <see cref="VolumeThresholdExceededEvent"/> / <see cref="AnomalyAlertResolvedEvent"/>
/// — création d'alerte et notifications via handlers MediatR.
/// </summary>
public class AnomalyDetectionService : IAnomalyDetectionService
{
    public const string AlertTypeAnomaly = "anomaly";
    public const string StatusActive = "active";
    public const string StatusResolved = "archived";
    public const double ZScoreThreshold = 2.5;
    public const int MovingAverageWeeks = 4;
    public const int TimeseriesWeeks = 12;
    public const string AlertsPagePath = "/alerts";

    private readonly IApplicationDbContext _context;
    private readonly IAnomalyTimeseriesService _timeseries;
    private readonly IAlertHistoryService _alertHistory;
    private readonly IDomainEventPublisher _events;
    private readonly ILogger<AnomalyDetectionService> _logger;

    public AnomalyDetectionService(
        IApplicationDbContext context,
        IAnomalyTimeseriesService timeseries,
        IAlertHistoryService alertHistory,
        IDomainEventPublisher events,
        ILogger<AnomalyDetectionService> logger)
    {
        _context = context;
        _timeseries = timeseries;
        _alertHistory = alertHistory;
        _events = events;
        _logger = logger;
    }

    public async Task<AnomalyDetectionResult> DetectAndPersistAsync(
        CancellationToken cancellationToken = default)
    {
        var ts = await _timeseries.GetTimeseriesAsync(TimeseriesWeeks, cancellationToken);
        var found = 0;
        var published = 0;
        var resolved = 0;

        var evaluatedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var anomalyKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var series in ts.Series)
        {
            var outcome = await EvaluateSeriesCoreAsync(series, publishEvents: true, cancellationToken);
            evaluatedKeys.Add(SeriesKey(series.DefectType, series.ProductionLine));
            if (outcome.IsAnomalous)
            {
                found++;
                anomalyKeys.Add(SeriesKey(series.DefectType, series.ProductionLine));
                if (outcome.PublishedThreshold) published++;
            }
        }

        resolved = await AutoResolveInactiveAsync(evaluatedKeys, anomalyKeys, cancellationToken);

        _logger.LogInformation(
            "Anomaly scan: scanned={Scanned}, found={Found}, thresholdsPublished={Published}, autoResolved={Resolved}",
            ts.Series.Count, found, published, resolved);

        return new AnomalyDetectionResult(ts.Series.Count, found, published, resolved);
    }

    public async Task EvaluateSeriesAsync(
        string? defectType,
        string? productionLine,
        CancellationToken cancellationToken = default)
    {
        var defect = Normalize(defectType);
        var line = Normalize(productionLine);

        var ts = await _timeseries.GetTimeseriesAsync(TimeseriesWeeks, cancellationToken);
        var series = ts.Series.FirstOrDefault(s =>
            string.Equals(Normalize(s.DefectType), defect, StringComparison.OrdinalIgnoreCase)
            && string.Equals(Normalize(s.ProductionLine), line, StringComparison.OrdinalIgnoreCase));

        if (series == null)
        {
            // Série absente de la fenêtre → tenter de résoudre une alerte active éventuelle.
            await TryResolveSeriesAsync(defect, line, cancellationToken);
            return;
        }

        var outcome = await EvaluateSeriesCoreAsync(series, publishEvents: true, cancellationToken);
        if (!outcome.IsAnomalous)
            await TryResolveSeriesAsync(defect, line, cancellationToken);
    }

    private async Task<(bool IsAnomalous, bool PublishedThreshold)> EvaluateSeriesCoreAsync(
        Application.MlFeatures.Queries.AnomalySeriesDto series,
        bool publishEvents,
        CancellationToken cancellationToken)
    {
        var counts = series.Weeks.Select(w => (double)w.Count).ToList();
        var scored = AnomalyZScoreCalculator.Evaluate(counts, MovingAverageWeeks, ZScoreThreshold);
        if (scored is null || !scored.IsAnomalous)
            return (false, false);

        if (!publishEvents)
            return (true, false);

        var departmentId = await ResolveDepartmentIdAsync(series.ProductionLine, cancellationToken);
        await _events.PublishAsync(new VolumeThresholdExceededEvent(
            series.DefectType,
            series.ProductionLine,
            scored.ZScore,
            (int)scored.CurrentCount,
            scored.BaselineMean,
            series.Weeks[^1].WeekLabel,
            departmentId,
            DateTime.UtcNow), cancellationToken);

        return (true, true);
    }

    private async Task TryResolveSeriesAsync(
        string defectType,
        string productionLine,
        CancellationToken cancellationToken)
    {
        var keys = SeriesKey(defectType, productionLine);
        var active = await _context.Alerts
            .Where(x => x.Type == AlertTypeAnomaly
                        && (x.Status == StatusActive || x.Status == AlertHistoryService.StatusPending)
                        && x.DefectType == defectType
                        && x.ProductionLine == productionLine)
            .ToListAsync(cancellationToken);

        foreach (var alert in active)
        {
            await ArchiveAndPublishResolvedAsync(alert, cancellationToken);
        }
    }

    private async Task<int> AutoResolveInactiveAsync(
        IReadOnlySet<string> evaluatedKeys,
        IReadOnlySet<string> anomalyKeys,
        CancellationToken cancellationToken)
    {
        var activeAlerts = await _context.Alerts
            .Where(x => x.Type == AlertTypeAnomaly
                        && (x.Status == StatusActive || x.Status == AlertHistoryService.StatusPending))
            .ToListAsync(cancellationToken);

        var n = 0;
        foreach (var alert in activeAlerts)
        {
            var key = SeriesKey(alert.DefectType, alert.ProductionLine);
            if (!evaluatedKeys.Contains(key) || anomalyKeys.Contains(key))
                continue;

            await ArchiveAndPublishResolvedAsync(alert, cancellationToken);
            n++;
        }

        return n;
    }

    private async Task ArchiveAndPublishResolvedAsync(Alert alert, CancellationToken cancellationToken)
    {
        try
        {
            await _alertHistory.ArchiveAsync(
                alert.Id,
                "auto-resolved",
                "system",
                "Détection automatique",
                cancellationToken);

            await _events.PublishAsync(new AnomalyAlertResolvedEvent(
                alert.Id,
                alert.DefectType,
                alert.ProductionLine,
                "auto-resolved",
                DateTime.UtcNow), cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to auto-resolve alert {AlertId}", alert.Id);
        }
    }

    private static string Normalize(string? value)
        => string.IsNullOrWhiteSpace(value) ? "UNKNOWN" : value.Trim();

    private static string SeriesKey(string? defectType, string? productionLine)
        => $"{Normalize(defectType)}|{Normalize(productionLine)}";

    private async Task<Guid?> ResolveDepartmentIdAsync(string productionLine, CancellationToken ct)
    {
        var line = productionLine?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(line) || string.Equals(line, "UNKNOWN", StringComparison.OrdinalIgnoreCase))
            return null;

        var lineLower = line.ToLowerInvariant();
        var deptIds = await _context.UserProfiles
            .AsNoTracking()
            .Where(p => p.LigneProduction != null && p.DepartmentId != null)
            .Where(p => p.LigneProduction!.ToLower() == lineLower)
            .Select(p => p.DepartmentId!.Value)
            .ToListAsync(ct);

        if (deptIds.Count == 0)
            return null;

        return deptIds
            .GroupBy(id => id)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .First();
    }
}
