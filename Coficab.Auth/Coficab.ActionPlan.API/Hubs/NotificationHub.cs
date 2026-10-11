using System.Security.Claims;
using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Hubs;

/// <summary>
/// Hub temps réel : notifications, alertes, statuts dossiers.
/// Les groupes (user / role:admins / dept / line) filtrent les événements par rôle et profil.
/// </summary>
[Authorize]
public class NotificationHub : Hub
{
    private readonly IApplicationDbContext _db;

    public NotificationHub(IApplicationDbContext db)
    {
        _db = db;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.FindFirst("sub")?.Value
                  ?? Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrWhiteSpace(userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, NotificationBroadcaster.UserGroup(userId));

            if (IsQualityAdmin(Context.User))
                await Groups.AddToGroupAsync(Context.ConnectionId, NotificationBroadcaster.AdminsGroup);

            var profile = await _db.UserProfiles.AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == userId);

            if (profile?.DepartmentId is Guid deptId)
                await Groups.AddToGroupAsync(Context.ConnectionId, NotificationBroadcaster.DeptGroup(deptId));

            var line = NotificationBroadcaster.NormalizeLine(profile?.LigneProduction);
            if (!string.IsNullOrEmpty(line))
                await Groups.AddToGroupAsync(Context.ConnectionId, NotificationBroadcaster.LineGroup(line));
        }

        await base.OnConnectedAsync();
    }

    private static bool IsQualityAdmin(ClaimsPrincipal? user)
    {
        if (user == null) return false;

        var roles = user.FindAll("role")
            .Concat(user.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        return roles.Contains("admin")
            || roles.Contains("superadmin")
            || roles.Contains("admin_quality");
    }
}
