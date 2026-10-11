using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace Coficab.ActionPlan.API.Hubs;

public class NotificationBroadcaster : INotificationBroadcaster
{
    public const string AdminsGroup = "role:admins";
    public const string UserGroupPrefix = "user:";
    public const string DeptGroupPrefix = "dept:";
    public const string LineGroupPrefix = "line:";

    private readonly IHubContext<NotificationHub> _hub;

    public NotificationBroadcaster(IHubContext<NotificationHub> hub) => _hub = hub;

    public static string UserGroup(string userId) => $"{UserGroupPrefix}{userId}";
    public static string DeptGroup(Guid departmentId) => $"{DeptGroupPrefix}{departmentId:D}";
    public static string LineGroup(string productionLine) =>
        $"{LineGroupPrefix}{NormalizeLine(productionLine)}";

    public static string NormalizeLine(string? productionLine) =>
        (productionLine ?? string.Empty).Trim().ToLowerInvariant();

    public async Task SendToUserAsync(string userId, object payload)
    {
        if (string.IsNullOrWhiteSpace(userId)) return;
        await _hub.Clients.Group(UserGroup(userId)).SendAsync("ReceiveNotification", payload);
    }

    public async Task SendAlertUpdatedAsync(AlertRealtimeEvent payload)
    {
        var groups = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { AdminsGroup };

        if (payload.DepartmentId.HasValue)
            groups.Add(DeptGroup(payload.DepartmentId.Value));

        var line = NormalizeLine(payload.ProductionLine);
        if (!string.IsNullOrEmpty(line))
            groups.Add(LineGroup(line));

        await _hub.Clients.Groups(groups.ToList()).SendAsync("ReceiveAlertUpdated", payload);
    }

    public async Task SendDossierStatusChangedAsync(
        DossierRealtimeEvent payload,
        IEnumerable<string> recipientUserIds,
        bool includeAdmins = false)
    {
        var groups = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var uid in recipientUserIds
                     .Where(u => !string.IsNullOrWhiteSpace(u))
                     .Select(u => u.Trim()))
        {
            groups.Add(UserGroup(uid));
        }

        if (includeAdmins)
            groups.Add(AdminsGroup);

        if (groups.Count == 0) return;

        await _hub.Clients.Groups(groups.ToList()).SendAsync("ReceiveDossierStatusChanged", payload);
    }
}
