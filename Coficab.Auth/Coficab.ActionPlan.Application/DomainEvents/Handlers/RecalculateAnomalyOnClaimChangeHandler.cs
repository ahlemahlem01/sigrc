using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.DomainEvents.Handlers;

/// <summary>
/// Recalcule l'anomalie volume pour la série DefectType × ProductionLine
/// dès qu'une réclamation est créée ou clôturée.
/// </summary>
public sealed class RecalculateAnomalyOnClaimChangeHandler :
    INotificationHandler<ClaimCreatedEvent>,
    INotificationHandler<ClaimClosedEvent>
{
    private readonly IAnomalyDetectionService _anomalyDetection;
    private readonly ILogger<RecalculateAnomalyOnClaimChangeHandler> _logger;

    public RecalculateAnomalyOnClaimChangeHandler(
        IAnomalyDetectionService anomalyDetection,
        ILogger<RecalculateAnomalyOnClaimChangeHandler> logger)
    {
        _anomalyDetection = anomalyDetection;
        _logger = logger;
    }

    public Task Handle(ClaimCreatedEvent notification, CancellationToken cancellationToken)
        => EvaluateAsync(notification.DefectType, notification.ProductionLine, cancellationToken);

    public Task Handle(ClaimClosedEvent notification, CancellationToken cancellationToken)
        => EvaluateAsync(notification.DefectType, notification.ProductionLine, cancellationToken);

    private async Task EvaluateAsync(string? defectType, string? productionLine, CancellationToken ct)
    {
        try
        {
            await _anomalyDetection.EvaluateSeriesAsync(defectType, productionLine, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Anomaly recalculation failed for {Defect}/{Line}",
                defectType, productionLine);
        }
    }
}
