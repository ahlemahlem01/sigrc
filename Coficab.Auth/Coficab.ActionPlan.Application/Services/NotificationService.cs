// Application/Services/NotificationService.cs
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

public class NotificationService : INotificationService
{
    private readonly IApplicationDbContext _context;
    private readonly INotificationBroadcaster _broadcaster;
    private readonly IUserRepository _userRepo;

    public NotificationService(
        IApplicationDbContext context,
        INotificationBroadcaster broadcaster,
        IUserRepository userRepo)
    {
        _context = context;
        _broadcaster = broadcaster;
        _userRepo = userRepo;
    }

    public Task NotifyAsync(string recipientId, string type, string title, string message, Guid? actionPlanId = null, string? linkPath = null, Guid? claimId = null)
        => NotifyCoreAsync(recipientId, type, title, message, null, actionPlanId, linkPath, claimId);

    public Task NotifyLocalizedAsync(string recipientId, string type, string title, string message, string dataJson, Guid? actionPlanId = null, string? linkPath = null, Guid? claimId = null)
        => NotifyCoreAsync(recipientId, type, title, message, dataJson, actionPlanId, linkPath, claimId);

    private async Task NotifyCoreAsync(string recipientId, string type, string title, string message, string? dataJson, Guid? actionPlanId, string? linkPath, Guid? claimId)
    {
        var notification = new Notification
        {
            DataJson = dataJson,
            RecipientId = recipientId,
            Type = type,
            Title = title,
            Message = message,
            ActionPlanId = actionPlanId,
            ClaimId = claimId,
            LinkPath = linkPath
        };

        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync();

        await _broadcaster.SendToUserAsync(recipientId, new
        {
            id = notification.Id,
            type = notification.Type,
            title = notification.Title,
            message = notification.Message,
            actionPlanId = notification.ActionPlanId,
            claimId = notification.ClaimId,
            linkPath = notification.LinkPath,
            dataJson = notification.DataJson,
            isRead = notification.IsRead,
            createdAt = notification.CreatedAt
        });
    }

    public async Task NotifyAdminsAsync(
        string type,
        string title,
        string message,
        Guid? actionPlanId = null,
        Guid? claimId = null,
        string? linkPath = null,
        string? excludeUserId = null)
    {
        var adminIds = await _userRepo.GetUserIdsByRoleAsync("admin");
        var superadminIds = await _userRepo.GetUserIdsByRoleAsync("superadmin");
        var qualityAdminIds = await _userRepo.GetUserIdsByRoleAsync("ADMIN_QUALITY");

        foreach (var adminId in adminIds.Concat(superadminIds).Concat(qualityAdminIds).Distinct())
        {
            if (!string.IsNullOrWhiteSpace(excludeUserId) &&
                string.Equals(adminId, excludeUserId, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            await NotifyAsync(adminId, type, title, message, actionPlanId, linkPath, claimId);
        }
    }

    public async Task<IEnumerable<Notification>> GetForUserAsync(string userId)
    {
        return await _context.Notifications
            .Where(n => n.RecipientId == userId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(50)
            .ToListAsync();
    }

    public async Task<int> GetUnreadCountAsync(string userId)
    {
        return await _context.Notifications
            .CountAsync(n => n.RecipientId == userId && !n.IsRead);
    }

    public async Task MarkAsReadAsync(Guid notificationId, string userId)
    {
        var notif = await _context.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.RecipientId == userId);
        if (notif == null) return;

        notif.IsRead = true;
        notif.ReadAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }
}
