// Application/Interfaces/INotificationService.cs
using Coficab.ActionPlan.Core.Entities;

public interface INotificationService
{
    Task NotifyAsync(string recipientId, string type, string title, string message, Guid? actionPlanId = null, string? linkPath = null, Guid? claimId = null);
    Task NotifyAdminsAsync(string type, string title, string message, Guid? actionPlanId = null, Guid? claimId = null, string? linkPath = null, string? excludeUserId = null);
    Task<IEnumerable<Notification>> GetForUserAsync(string userId);
    Task<int> GetUnreadCountAsync(string userId);
    Task MarkAsReadAsync(Guid notificationId, string userId);
}