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

    public async Task NotifyValidatorsAsync(
        string type,
        string title,
        string message,
        string? permission,
        Guid? departmentId = null,
        Guid? actionPlanId = null,
        Guid? claimId = null,
        string? linkPath = null,
        string? excludeUserId = null)
    {
        var department = departmentId ?? (claimId.HasValue ? await ClaimDepartmentAsync(claimId.Value) : null);
        var recipients = (await ValidatorIdsAsync(department, permission))
            .Where(id => string.IsNullOrWhiteSpace(excludeUserId) || !string.Equals(id, excludeUserId, StringComparison.OrdinalIgnoreCase))
            .ToList();

        // last resort: nobody else can decide (no administrator in the department, or the only one is the submitter)
        if (recipients.Count == 0)
        {
            recipients = (await _userRepo.GetUserIdsByRoleAsync("superadmin"))
                .Where(id => string.IsNullOrWhiteSpace(excludeUserId) || !string.Equals(id, excludeUserId, StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        foreach (var id in recipients)
            await NotifyAsync(id, type, title, message, actionPlanId, linkPath, claimId);
    }

    /// <summary>Department of a claim: the one of the person in charge, or failing that of the person who raised it.</summary>
    private async Task<Guid?> ClaimDepartmentAsync(Guid claimId)
    {
        var claim = await _context.Claims.AsNoTracking().Where(c => c.Id == claimId)
            .Select(c => new { c.AssignedToId, c.CreatedById }).FirstOrDefaultAsync();
        if (claim == null) return null;
        foreach (var userId in new[] { claim.AssignedToId, claim.CreatedById })
        {
            if (string.IsNullOrWhiteSpace(userId)) continue;
            var dept = await _context.UserProfiles.AsNoTracking().Where(p => p.UserId == userId).Select(p => p.DepartmentId).FirstOrDefaultAsync();
            if (dept != null) return dept;
        }
        return null;
    }

    private async Task<List<string>> ValidatorIdsAsync(Guid? department, string? permission)
    {
        var admins = (await _userRepo.GetUserIdsByRoleAsync("admin")).Concat(await _userRepo.GetUserIdsByRoleAsync("ADMIN_QUALITY")).ToList();

        // a superadmin is told only about the departments they chose to follow (the last resort is handled by the caller)
        var ids = new List<string>();
        if (department != null)
        {
            var superadmins = new HashSet<string>(await _userRepo.GetUserIdsByRoleAsync("superadmin"), StringComparer.OrdinalIgnoreCase);
            var watchers = await _context.SuperadminDepartmentWatches.AsNoTracking()
                .Where(w => w.DepartmentId == department).Select(w => w.UserId).ToListAsync();
            ids.AddRange(watchers.Where(superadmins.Contains));
        }
        if (department == null)
        {
            ids.AddRange(admins);   // department unknown: nobody must be left without the request
            return ids.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        var sameDepartment = await _context.UserProfiles.AsNoTracking()
            .Where(p => p.DepartmentId == department && p.UserId != "").Select(p => p.UserId).ToListAsync();
        var inDepartment = new HashSet<string>(sameDepartment, StringComparer.OrdinalIgnoreCase);
        ids.AddRange(admins.Where(inDepartment.Contains));

        if (!string.IsNullOrWhiteSpace(permission))
        {
            var holders = await _context.UserFunctions.AsNoTracking()
                .Where(uf => uf.Status != Core.Enums.FunctionStatus.NotActive && uf.Function.DepartmentId == department && uf.Function.Permissions != null)
                .Select(uf => new { uf.UserId, uf.Function.Permissions }).ToListAsync();
            ids.AddRange(holders
                .Where(h => h.Permissions!.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Contains(permission, StringComparer.OrdinalIgnoreCase))
                .Select(h => h.UserId));
        }
        return ids.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
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
