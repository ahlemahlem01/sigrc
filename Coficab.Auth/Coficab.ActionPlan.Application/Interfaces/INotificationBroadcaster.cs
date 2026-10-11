namespace Coficab.ActionPlan.Application.Interfaces;

/// <summary>
/// Payload push pour une alerte qualité (filtrage côté hub via groupes dept/line/admins).
/// </summary>
public record AlertRealtimeEvent(
    Guid AlertId,
    string Status,
    string DefectType,
    string ProductionLine,
    DateTime DetectedAt,
    Guid? DepartmentId,
    string ChangeType);

/// <summary>
/// Payload push pour un changement de statut claim / 8D / CAPA.
/// </summary>
public record DossierRealtimeEvent(
    string Kind,
    Guid? ClaimId,
    Guid? ActionPlanId,
    string Status,
    string? Title,
    string? AssignedToId);

public interface INotificationBroadcaster
{
    Task SendToUserAsync(string userId, object payload);

    /// <summary>
    /// Diffuse une mise à jour d'alerte aux groupes admins + département + ligne concernés.
    /// </summary>
    Task SendAlertUpdatedAsync(AlertRealtimeEvent payload);

    /// <summary>
    /// Diffuse un changement de dossier aux utilisateurs ciblés (et optionnellement aux admins).
    /// </summary>
    Task SendDossierStatusChangedAsync(
        DossierRealtimeEvent payload,
        IEnumerable<string> recipientUserIds,
        bool includeAdmins = false);
}
