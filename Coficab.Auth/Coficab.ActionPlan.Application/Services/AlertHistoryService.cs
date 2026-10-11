using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

public interface IAlertHistoryService
{
    Task RecordDetectedAsync(Alert alert, CancellationToken cancellationToken = default);
    Task ArchiveAsync(Guid alertId, string reason, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task UnarchiveAsync(Guid alertId, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task<AlertReport> SubmitReportAsync(Guid alertId, string content, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task ReviewReportAsync(Guid alertId, Guid reportId, bool accept, string? note, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task DecideAsync(Guid alertId, bool accept, string? note, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task UpdateReportAsync(Guid alertId, Guid reportId, string content, string actorId, CancellationToken cancellationToken = default);
    Task UpdateAnalysisAsync(Guid alertId, string? problem, string? probableCause, string? consequences, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task<AlertComment> AddCommentAsync(Guid alertId, string body, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task ArchiveCommentAsync(Guid alertId, Guid commentId, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task<AlertAttachment> AddAttachmentAsync(Guid alertId, string fileName, string? contentType, byte[] data, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task ArchiveAttachmentAsync(Guid alertId, Guid attachmentId, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task LinkCapaAsync(Guid alertId, Guid actionPlanId, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task RecordLinkedCapaChangeAsync(Guid alertId, Guid actionPlanId, string eventType, string title, string? detail, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task RecordMonitoringAsync(Guid alertId, string outcome, string actorId, string? actorName, CancellationToken cancellationToken = default);
    Task<AlertHistoryDto> GetHistoryAsync(Guid alertId, CancellationToken cancellationToken = default);
}

public record AlertHistoryDto(
    IReadOnlyList<AlertTimelineItemDto> Timeline,
    IReadOnlyList<AlertReportDto> Reports,
    IReadOnlyList<AlertCommentDto> Comments,
    IReadOnlyList<AlertAttachmentDto> Attachments,
    IReadOnlyList<AlertCapaDto> Capas);

public record AlertTimelineItemDto(Guid Id, string EventType, string Title, string? Detail, string? ActorName, DateTime CreatedAt);
public record AlertReportDto(Guid Id, string Content, string Status, string? AuthorId, string? AuthorName, string? ReviewNote, DateTime CreatedAt, DateTime? ReviewedAt, string? AuthorAvatarUrl = null);
public record AlertCommentDto(Guid Id, string Body, string? AuthorName, DateTime CreatedAt, bool IsArchived, string? AuthorId = null, string? AuthorAvatarUrl = null);
public record AlertAttachmentDto(Guid Id, string FileName, string? ContentType, DateTime CreatedAt, bool IsArchived);
public record AlertCapaDto(Guid Id, string Title, int Status, bool IsArchived, DateTime CreatedAt);

public class AlertHistoryService : IAlertHistoryService
{
    public const string StatusPending = "pending_validation";
    public const string StatusValidated = "validated";
    public const string StatusRejected = "rejected";
    public const string StatusArchived = "archived";

    private readonly IApplicationDbContext _db;
    private readonly INotificationService _notifications;
    private readonly INotificationBroadcaster _realtime;
    private readonly IUserRepository _users;
    private readonly ILogger<AlertHistoryService> _logger;

    public AlertHistoryService(
        IApplicationDbContext db,
        INotificationService notifications,
        INotificationBroadcaster realtime,
        IUserRepository users,
        ILogger<AlertHistoryService> logger)
    {
        _db = db;
        _notifications = notifications;
        _realtime = realtime;
        _users = users;
        _logger = logger;
    }

    public async Task RecordDetectedAsync(Alert alert, CancellationToken cancellationToken = default)
    {
        var exists = await _db.AlertTimelineEvents.AnyAsync(
            e => e.AlertId == alert.Id && e.EventType == "detected", cancellationToken);
        if (exists) return;

        _db.AlertTimelineEvents.Add(new AlertTimelineEvent
        {
            AlertId = alert.Id,
            EventType = "detected",
            Title = "Alerte détectée",
            Detail = alert.Description,
            CreatedAt = alert.DetectedAt,
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task ArchiveAsync(Guid alertId, string reason, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();

        var normalized = NormalizeReason(reason);
        if (!string.Equals(alert.Status, StatusArchived, StringComparison.OrdinalIgnoreCase))
        {
            alert.StatusBeforeArchive = NormalizeWorkflow(alert.Status);
            alert.Status = StatusArchived;
            alert.ArchiveReason = normalized;
            alert.ArchivedAt = DateTime.UtcNow;
            alert.ArchivedBy = actorId;
        }

        await AddEventAsync(alertId, "archived", "Alerte archivée", ReasonLabel(normalized), actorId, actorName, null, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await BroadcastAlertAsync(alert, "archived", cancellationToken);
    }

    public async Task UnarchiveAsync(Guid alertId, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();
        if (!string.Equals(alert.Status, StatusArchived, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(alert.Status, "resolved", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Cette alerte n’est pas archivée.");

        var restored = NormalizeWorkflow(alert.StatusBeforeArchive);
        if (string.IsNullOrEmpty(alert.StatusBeforeArchive))
            restored = await InferStatusAsync(alertId, cancellationToken);

        alert.Status = restored;
        alert.ArchiveReason = null;
        alert.ArchivedAt = null;
        alert.ArchivedBy = null;
        alert.StatusBeforeArchive = null;

        await AddEventAsync(alertId, "unarchived", "Alerte restaurée", WorkflowLabel(restored), actorId, actorName, null, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await BroadcastAlertAsync(alert, "unarchived", cancellationToken);
    }

    public async Task<AlertReport> SubmitReportAsync(Guid alertId, string content, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        await EnsureAlertExists(alertId, cancellationToken);
        var text = (content ?? string.Empty).Trim();
        if (text.Length == 0) throw new InvalidOperationException("Le rapport est vide.");

        var report = new AlertReport
        {
            AlertId = alertId,
            AuthorId = actorId,
            AuthorName = actorName,
            Content = text,
            Status = "Submitted",
        };
        _db.AlertReports.Add(report);
        await SetDecisionStatusAsync(alertId, StatusPending, cancellationToken);
        await AddEventAsync(alertId, "report_submitted", "Rapport soumis", text, actorId, actorName, report.Id, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        var alert = await _db.Alerts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken);
        await NotifyAsync(
            actorId,
            "alert_report_pending_validation",
            "Rapport en attente de validation",
            $"Votre compte-rendu sur {ScopeLabel(alert)} attend une décision.",
            cancellationToken);
        await NotifyAdminsAsync(
            actorId,
            "alert_report_to_validate",
            "Compte-rendu à valider",
            $"{actorName ?? "Un employé"} a envoyé un compte-rendu sur {ScopeLabel(alert)}.",
            cancellationToken);
        return report;
    }

    public async Task ReviewReportAsync(Guid alertId, Guid reportId, bool accept, string? note, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        var report = await _db.AlertReports.FirstOrDefaultAsync(r => r.Id == reportId && r.AlertId == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();

        report.Status = accept ? "Validated" : "Rejected";
        report.ReviewNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        report.ReviewedBy = actorId;
        report.ReviewedAt = DateTime.UtcNow;

        var stillPending = await _db.AlertReports.AnyAsync(
            r => r.AlertId == alertId && r.Id != reportId && r.Status == "Submitted",
            cancellationToken);
        await SetDecisionStatusAsync(alertId, stillPending ? StatusPending : (accept ? StatusValidated : StatusRejected), cancellationToken);

        await AddEventAsync(
            alertId,
            accept ? "report_validated" : "report_rejected",
            accept ? "Rapport validé" : "Rapport rejeté",
            report.ReviewNote ?? report.Content,
            actorId,
            actorName,
            report.Id,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        var alert = await _db.Alerts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken);
        var decision = accept ? "validé" : "rejeté";
        var extra = string.IsNullOrWhiteSpace(report.ReviewNote) ? string.Empty : $" {report.ReviewNote}";
        await NotifyAsync(
            report.AuthorId,
            accept ? "alert_report_validated" : "alert_report_rejected",
            accept ? "Rapport validé" : "Rapport rejeté",
            $"Votre compte-rendu sur {ScopeLabel(alert)} a été {decision}.{extra}",
            cancellationToken);
        if (alert != null)
            await BroadcastAlertAsync(alert, accept ? "validated" : "rejected", cancellationToken);
    }

    public async Task DecideAsync(Guid alertId, bool accept, string? note, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        var pending = await _db.AlertReports
            .Where(r => r.AlertId == alertId && r.Status == "Submitted")
            .OrderBy(r => r.CreatedAt)
            .Select(r => r.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (pending != Guid.Empty)
        {
            await ReviewReportAsync(alertId, pending, accept, note, actorId, actorName, cancellationToken);
            return;
        }

        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();
        EnsurePending(alert);
        alert.Status = accept ? StatusValidated : StatusRejected;
        var reason = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        await AddEventAsync(
            alertId,
            accept ? "alert_validated" : "alert_rejected",
            accept ? "Alerte validée" : "Alerte rejetée",
            reason,
            actorId,
            actorName,
            null,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await BroadcastAlertAsync(alert, accept ? "validated" : "rejected", cancellationToken);
    }

    public async Task UpdateReportAsync(Guid alertId, Guid reportId, string content, string actorId, CancellationToken cancellationToken = default)
    {
        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();
        EnsurePending(alert);

        var report = await _db.AlertReports.FirstOrDefaultAsync(r => r.Id == reportId && r.AlertId == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();
        if (!string.Equals(report.Status, "Submitted", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Ce compte-rendu ne peut plus être modifié.");
        if (!string.Equals(report.AuthorId, actorId, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Seul l’auteur peut modifier ce compte-rendu.");

        var text = (content ?? string.Empty).Trim();
        if (text.Length == 0) throw new InvalidOperationException("Le rapport est vide.");
        report.Content = text;
        await AddEventAsync(alertId, "report_updated", "Compte-rendu modifié", text, actorId, report.AuthorName, report.Id, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAnalysisAsync(Guid alertId, string? problem, string? probableCause, string? consequences, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();
        EnsurePending(alert);

        alert.AiProblem = Truncate(problem, 1000);
        alert.AiProbableCause = Truncate(probableCause, 1500);
        alert.AiConsequences = Truncate(consequences, 1500);
        alert.AiAnalyzedAt = DateTime.UtcNow;
        await AddEventAsync(alertId, "analysis_updated", "Analyse modifiée", alert.AiProblem, actorId, actorName, null, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<AlertComment> AddCommentAsync(Guid alertId, string body, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        await EnsureAlertExists(alertId, cancellationToken);
        var text = (body ?? string.Empty).Trim();
        if (text.Length == 0) throw new InvalidOperationException("Commentaire vide.");

        var comment = new AlertComment
        {
            AlertId = alertId,
            AuthorId = actorId,
            AuthorName = actorName,
            Body = text,
        };
        _db.AlertComments.Add(comment);
        await AddEventAsync(alertId, "comment_added", "Commentaire ajouté", text, actorId, actorName, comment.Id, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return comment;
    }

    public async Task ArchiveCommentAsync(Guid alertId, Guid commentId, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        var comment = await _db.AlertComments.FirstOrDefaultAsync(c => c.Id == commentId && c.AlertId == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();
        if (!comment.IsArchived)
        {
            comment.IsArchived = true;
            comment.ArchivedAt = DateTime.UtcNow;
            comment.ArchivedBy = actorId;
        }
        await AddEventAsync(alertId, "comment_archived", "Commentaire archivé", comment.Body, actorId, actorName, comment.Id, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<AlertAttachment> AddAttachmentAsync(Guid alertId, string fileName, string? contentType, byte[] data, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        await EnsureAlertExists(alertId, cancellationToken);
        if (data == null || data.Length == 0) throw new InvalidOperationException("Fichier vide.");

        var attachment = new AlertAttachment
        {
            AlertId = alertId,
            FileName = string.IsNullOrWhiteSpace(fileName) ? "fichier" : fileName.Trim(),
            ContentType = contentType,
            Data = data,
            CreatedBy = actorId,
        };
        _db.AlertAttachments.Add(attachment);
        await AddEventAsync(alertId, "attachment_added", "Pièce jointe ajoutée", attachment.FileName, actorId, actorName, attachment.Id, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return attachment;
    }

    public async Task ArchiveAttachmentAsync(Guid alertId, Guid attachmentId, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        var attachment = await _db.AlertAttachments.FirstOrDefaultAsync(a => a.Id == attachmentId && a.AlertId == alertId, cancellationToken)
            ?? throw new KeyNotFoundException();
        if (!attachment.IsArchived)
        {
            attachment.IsArchived = true;
            attachment.ArchivedAt = DateTime.UtcNow;
            attachment.ArchivedBy = actorId;
        }
        await AddEventAsync(alertId, "attachment_archived", "Pièce jointe archivée", attachment.FileName, actorId, actorName, attachment.Id, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task LinkCapaAsync(Guid alertId, Guid actionPlanId, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        await EnsureAlertExists(alertId, cancellationToken);
        var plan = await _db.ActionPlans.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == actionPlanId, cancellationToken)
            ?? throw new KeyNotFoundException();
        plan.AlertId = alertId;
        await AddEventAsync(alertId, "capa_created", "CAPA créé", plan.Title, actorId, actorName, plan.Id, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task RecordLinkedCapaChangeAsync(Guid alertId, Guid actionPlanId, string eventType, string title, string? detail, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        await EnsureAlertExists(alertId, cancellationToken);
        await AddEventAsync(alertId, eventType, title, detail, actorId, actorName, actionPlanId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task RecordMonitoringAsync(Guid alertId, string outcome, string actorId, string? actorName, CancellationToken cancellationToken = default)
    {
        await EnsureAlertExists(alertId, cancellationToken);
        var text = (outcome ?? string.Empty).Trim();
        if (text.Length == 0) throw new InvalidOperationException("Suivi vide.");
        await AddEventAsync(alertId, "monitoring_outcome", "Suivi", text, actorId, actorName, null, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<AlertHistoryDto> GetHistoryAsync(Guid alertId, CancellationToken cancellationToken = default)
    {
        await EnsureAlertExists(alertId, cancellationToken);

        var events = await _db.AlertTimelineEvents.AsNoTracking()
            .Where(e => e.AlertId == alertId)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new AlertTimelineItemDto(e.Id, e.EventType, e.Title, e.Detail, e.ActorName, e.CreatedAt))
            .ToListAsync(cancellationToken);

        var reportRows = await _db.AlertReports.AsNoTracking()
            .Where(r => r.AlertId == alertId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new { r.Id, r.Content, r.Status, r.AuthorId, r.AuthorName, r.ReviewNote, r.CreatedAt, r.ReviewedAt })
            .ToListAsync(cancellationToken);

        var commentRows = await _db.AlertComments.AsNoTracking()
            .Where(c => c.AlertId == alertId)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new { c.Id, c.Body, c.AuthorName, c.AuthorId, c.CreatedAt, c.IsArchived })
            .ToListAsync(cancellationToken);

        var authorIds = reportRows.Select(r => r.AuthorId)
            .Concat(commentRows.Select(c => c.AuthorId))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();
        var profiles = authorIds.Count == 0
            ? []
            : await _db.UserProfiles.AsNoTracking()
                .Where(p => authorIds.Contains(p.UserId))
                .Select(p => new { p.UserId, p.ProfilePictureUrl })
                .ToListAsync(cancellationToken);
        var avatars = profiles.ToDictionary(p => p.UserId, p => p.ProfilePictureUrl, StringComparer.OrdinalIgnoreCase);

        var reports = reportRows
            .Select(r => new AlertReportDto(r.Id, r.Content, r.Status, r.AuthorId, r.AuthorName, r.ReviewNote, r.CreatedAt, r.ReviewedAt, AvatarOf(avatars, r.AuthorId)))
            .ToList();
        var comments = commentRows
            .Select(c => new AlertCommentDto(c.Id, c.Body, c.AuthorName, c.CreatedAt, c.IsArchived, c.AuthorId, AvatarOf(avatars, c.AuthorId)))
            .ToList();

        var attachments = await _db.AlertAttachments.AsNoTracking()
            .Where(a => a.AlertId == alertId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new AlertAttachmentDto(a.Id, a.FileName, a.ContentType, a.CreatedAt, a.IsArchived))
            .ToListAsync(cancellationToken);

        var capas = await _db.ActionPlans.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.AlertId == alertId)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new AlertCapaDto(p.Id, p.Title, (int)p.Status, p.IsArchived, p.CreatedAt))
            .ToListAsync(cancellationToken);

        return new AlertHistoryDto(events, reports, comments, attachments, capas);
    }

    private async Task NotifyAdminsAsync(string? exceptUserId, string type, string title, string message, CancellationToken cancellationToken)
    {
        IEnumerable<string> admins;
        IEnumerable<string> superadmins;
        try
        {
            admins = await _users.GetUserIdsByRoleAsync("admin");
            superadmins = await _users.GetUserIdsByRoleAsync("superadmin");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve admin recipients for {Type}", type);
            return;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in admins.Concat(superadmins))
        {
            if (string.IsNullOrWhiteSpace(id) || !seen.Add(id)) continue;
            if (!string.IsNullOrEmpty(exceptUserId) && string.Equals(id, exceptUserId, StringComparison.OrdinalIgnoreCase))
                continue;
            await NotifyAsync(id, type, title, message, cancellationToken);
        }
    }

    private async Task NotifyAsync(string? recipientId, string type, string title, string message, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(recipientId) || recipientId == "system") return;
        try
        {
            await _notifications.NotifyAsync(
                recipientId,
                type,
                title,
                message.Length > 500 ? message[..500] : message,
                actionPlanId: null,
                linkPath: "/alerts",
                claimId: null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to notify {RecipientId} for {Type}", recipientId, type);
        }
    }

    private static string ScopeLabel(Alert? alert)
    {
        var defect = alert?.DefectType?.Trim();
        var line = alert?.ProductionLine?.Trim();
        if (!string.IsNullOrEmpty(defect) && !string.IsNullOrEmpty(line)) return $"{defect} / {line}";
        return defect ?? line ?? "cette alerte";
    }

    private static void EnsurePending(Alert alert)
    {
        var status = alert.Status?.Trim().ToLowerInvariant();
        if (status is not ("pending_validation" or "active"))
            throw new InvalidOperationException("Modification possible uniquement tant que l’alerte est en attente de validation.");
    }

    private static string? Truncate(string? value, int max)
    {
        var text = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        if (text == null || text.Length <= max) return text;
        return text[..max];
    }

    private async Task BroadcastAlertAsync(Alert alert, string changeType, CancellationToken cancellationToken)
    {
        try
        {
            await _realtime.SendAlertUpdatedAsync(new AlertRealtimeEvent(
                alert.Id,
                alert.Status,
                alert.DefectType,
                alert.ProductionLine,
                alert.DetectedAt,
                alert.DepartmentId,
                changeType));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast alert {AlertId} ({ChangeType})", alert.Id, changeType);
        }
    }

    private async Task SetDecisionStatusAsync(Guid alertId, string status, CancellationToken cancellationToken)
    {
        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken);
        if (alert == null || string.Equals(alert.Status, StatusArchived, StringComparison.OrdinalIgnoreCase))
            return;
        alert.Status = status;
    }

    private async Task EnsureAlertExists(Guid alertId, CancellationToken ct)
    {
        if (!await _db.Alerts.AnyAsync(a => a.Id == alertId, ct))
            throw new KeyNotFoundException();
    }

    private Task AddEventAsync(Guid alertId, string type, string title, string? detail, string? actorId, string? actorName, Guid? relatedId, CancellationToken ct)
    {
        _db.AlertTimelineEvents.Add(new AlertTimelineEvent
        {
            AlertId = alertId,
            EventType = type,
            Title = title,
            Detail = detail,
            ActorId = actorId,
            ActorName = actorName,
            RelatedId = relatedId,
        });
        return Task.CompletedTask;
    }

    private async Task<string> InferStatusAsync(Guid alertId, CancellationToken cancellationToken)
    {
        var reports = await _db.AlertReports.AsNoTracking()
            .Where(r => r.AlertId == alertId)
            .Select(r => r.Status)
            .ToListAsync(cancellationToken);
        if (reports.Any(s => string.Equals(s, "Submitted", StringComparison.OrdinalIgnoreCase)))
            return StatusPending;
        if (reports.Any(s => string.Equals(s, "Validated", StringComparison.OrdinalIgnoreCase)))
            return StatusValidated;
        if (reports.Any(s => string.Equals(s, "Rejected", StringComparison.OrdinalIgnoreCase)))
            return StatusRejected;
        return StatusPending;
    }

    private static string NormalizeWorkflow(string? status)
    {
        var value = (status ?? string.Empty).Trim().ToLowerInvariant();
        return value switch
        {
            StatusValidated => StatusValidated,
            StatusRejected => StatusRejected,
            "active" or StatusPending or "pending" => StatusPending,
            _ => StatusPending,
        };
    }

    private static string WorkflowLabel(string status) => status switch
    {
        StatusValidated => "Validée",
        StatusRejected => "Rejetée",
        _ => "En attente de validation",
    };

    private static string? AvatarOf(IReadOnlyDictionary<string, string?> avatars, string? userId)
    {
        if (string.IsNullOrWhiteSpace(userId)) return null;
        return avatars.TryGetValue(userId, out var url) ? url : null;
    }

    private static string NormalizeReason(string reason)
    {
        var r = (reason ?? "manual").Trim().ToLowerInvariant();
        return r is "auto-resolved" or "abandoned" or "manual" ? r : "manual";
    }

    private static string ReasonLabel(string reason) => reason switch
    {
        "auto-resolved" => "Résolution automatique",
        "abandoned" => "Abandonnée",
        _ => "Clôture manuelle",
    };
}
