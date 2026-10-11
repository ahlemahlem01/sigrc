using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.DomainEvents.Handlers;

/// <summary>
/// Side-effects après création d'alerte : historique, analyse IA, notifications, SignalR.
/// </summary>
public sealed class NotifyOnAnomalyAlertCreatedHandler : INotificationHandler<AnomalyAlertCreatedEvent>
{
    private readonly IApplicationDbContext _db;
    private readonly IAlertHistoryService _alertHistory;
    private readonly IAlertAnalysisService _alertAnalysis;
    private readonly INotificationService _notificationService;
    private readonly INotificationBroadcaster _realtime;
    private readonly IUserRepository _userRepo;
    private readonly ILogger<NotifyOnAnomalyAlertCreatedHandler> _logger;

    public NotifyOnAnomalyAlertCreatedHandler(
        IApplicationDbContext db,
        IAlertHistoryService alertHistory,
        IAlertAnalysisService alertAnalysis,
        INotificationService notificationService,
        INotificationBroadcaster realtime,
        IUserRepository userRepo,
        ILogger<NotifyOnAnomalyAlertCreatedHandler> logger)
    {
        _db = db;
        _alertHistory = alertHistory;
        _alertAnalysis = alertAnalysis;
        _notificationService = notificationService;
        _realtime = realtime;
        _userRepo = userRepo;
        _logger = logger;
    }

    public async Task Handle(AnomalyAlertCreatedEvent notification, CancellationToken cancellationToken)
    {
        var alert = await _db.Alerts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == notification.AlertId, cancellationToken);
        if (alert == null) return;

        try { await _alertHistory.RecordDetectedAsync(alert, cancellationToken); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to record detection history for alert {AlertId}", alert.Id);
        }

        try { await _alertAnalysis.GenerateAndPersistAsync(alert.Id, force: false, cancellationToken); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate AI analysis for alert {AlertId}", alert.Id);
        }

        try
        {
            await NotifyRecipientsAsync(alert, cancellationToken);
            await _realtime.SendAlertUpdatedAsync(new AlertRealtimeEvent(
                alert.Id,
                alert.Status,
                alert.DefectType,
                alert.ProductionLine,
                alert.DetectedAt,
                alert.DepartmentId,
                "created"));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to notify recipients for alert {AlertId}", alert.Id);
        }
    }

    private async Task NotifyRecipientsAsync(Alert alert, CancellationToken ct)
    {
        var recipientIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var id in (await _userRepo.GetUserIdsByRoleAsync("admin"))
                     .Concat(await _userRepo.GetUserIdsByRoleAsync("superadmin")))
        {
            if (!string.IsNullOrWhiteSpace(id))
                recipientIds.Add(id);
        }

        var line = alert.ProductionLine?.Trim() ?? string.Empty;
        if (!string.IsNullOrEmpty(line))
        {
            var lineLower = line.ToLowerInvariant();
            var lineUserIds = await _db.UserProfiles.AsNoTracking()
                .Where(p => p.LigneProduction != null && p.LigneProduction.ToLower() == lineLower)
                .Select(p => p.UserId)
                .ToListAsync(ct);
            foreach (var uid in lineUserIds)
                if (!string.IsNullOrWhiteSpace(uid))
                    recipientIds.Add(uid);
        }

        if (alert.DepartmentId.HasValue)
        {
            var deptUserIds = await _db.UserProfiles.AsNoTracking()
                .Where(p => p.DepartmentId == alert.DepartmentId)
                .Select(p => p.UserId)
                .ToListAsync(ct);
            foreach (var uid in deptUserIds)
                if (!string.IsNullOrWhiteSpace(uid))
                    recipientIds.Add(uid);
        }

        var title = "Alerte anomalie qualité";
        var message =
            $"{alert.DefectType} / {alert.ProductionLine} — z = {alert.ZScore:F2}. " +
            "Consultez la page Alertes.";

        foreach (var recipientId in recipientIds)
        {
            await _notificationService.NotifyAsync(
                recipientId,
                "quality_anomaly_alert",
                title,
                message,
                actionPlanId: null,
                linkPath: AnomalyDetectionService.AlertsPagePath,
                claimId: null);
        }
    }
}
