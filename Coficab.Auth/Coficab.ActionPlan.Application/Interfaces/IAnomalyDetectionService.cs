namespace Coficab.ActionPlan.Application.Interfaces;

public record AnomalyDetectionResult(
    int SeriesScanned,
    int AnomaliesFound,
    int AlertsCreated,
    int DuplicatesSkipped
);

public interface IAnomalyDetectionService
{
    /// <summary>
    /// Scan complet (réconciliation / outil admin). Publie des événements domaine
    /// au lieu de notifier inline.
    /// </summary>
    Task<AnomalyDetectionResult> DetectAndPersistAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Évalue une seule série DefectType × ProductionLine (chemin événementiel).
    /// </summary>
    Task EvaluateSeriesAsync(
        string? defectType,
        string? productionLine,
        CancellationToken cancellationToken = default);
}

public interface IAnomalyTimeseriesService
{
    Task<MlFeatures.Queries.AnomalyTimeseriesDto> GetTimeseriesAsync(
        int weeks = 12,
        CancellationToken cancellationToken = default);
}
