using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.DomainEvents.Handlers;

/// <summary>
/// Crée une alerte anomalie lorsqu'un seuil de volume est dépassé (pas de doublon actif).
/// </summary>
public sealed class CreateAlertOnVolumeThresholdHandler : INotificationHandler<VolumeThresholdExceededEvent>
{
    private readonly IApplicationDbContext _db;
    private readonly IDomainEventPublisher _events;
    private readonly ILogger<CreateAlertOnVolumeThresholdHandler> _logger;

    public CreateAlertOnVolumeThresholdHandler(
        IApplicationDbContext db,
        IDomainEventPublisher events,
        ILogger<CreateAlertOnVolumeThresholdHandler> logger)
    {
        _db = db;
        _events = events;
        _logger = logger;
    }

    public async Task Handle(VolumeThresholdExceededEvent notification, CancellationToken cancellationToken)
    {
        var existsActive = await _db.Alerts.AnyAsync(
            x => x.Type == AnomalyDetectionService.AlertTypeAnomaly
                 && x.Status != AlertHistoryService.StatusArchived
                 && x.Status != "resolved"
                 && x.DefectType == notification.DefectType
                 && x.ProductionLine == notification.ProductionLine,
            cancellationToken);

        if (existsActive)
        {
            _logger.LogDebug(
                "Skip alert create — active anomaly already exists for {Defect}/{Line}",
                notification.DefectType, notification.ProductionLine);
            return;
        }

        var now = DateTime.UtcNow;
        var alert = new Alert
        {
            Id = Guid.NewGuid(),
            Type = AnomalyDetectionService.AlertTypeAnomaly,
            DefectType = notification.DefectType,
            ProductionLine = notification.ProductionLine,
            ZScore = notification.ZScore,
            CurrentCount = notification.CurrentCount,
            BaselineMean = notification.BaselineMean,
            DetectedAt = now,
            Status = AlertHistoryService.StatusPending,
            DepartmentId = notification.DepartmentId,
            Description =
                $"Anomalie de volume claims : {notification.DefectType} / {notification.ProductionLine} — " +
                $"{notification.CurrentCount} claim(s) en {notification.WeekLabel} " +
                $"(moyenne 4 sem. = {notification.BaselineMean}, z = {notification.ZScore:F2}).",
        };

        _db.Alerts.Add(alert);
        await _db.SaveChangesAsync(cancellationToken);

        await _events.PublishAsync(new AnomalyAlertCreatedEvent(
            alert.Id,
            alert.DefectType,
            alert.ProductionLine,
            alert.ZScore,
            alert.CurrentCount,
            alert.BaselineMean,
            alert.DepartmentId,
            alert.Status,
            alert.DetectedAt,
            DateTime.UtcNow), cancellationToken);
    }
}
