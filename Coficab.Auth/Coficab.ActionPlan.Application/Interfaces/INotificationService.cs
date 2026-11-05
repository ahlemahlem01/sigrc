// Application/Interfaces/INotificationService.cs
using Coficab.ActionPlan.Core.Entities;

public interface INotificationService
{
    Task NotifyAsync(string recipientId, string type, string title, string message, Guid? actionPlanId = null, string? linkPath = null, Guid? claimId = null);
    /// <summary>Same as NotifyAsync, with the raw facts in DataJson: the screen translates it, Title and Message are the fallback.</summary>
    Task NotifyLocalizedAsync(string recipientId, string type, string title, string message, string dataJson, Guid? actionPlanId = null, string? linkPath = null, Guid? claimId = null);
    Task NotifyAdminsAsync(string type, string title, string message, Guid? actionPlanId = null, Guid? claimId = null, string? linkPath = null, string? excludeUserId = null);
    /// <summary>
    /// Asks for a validation: tells the people who can give it, not every administrator of the company. They are the administrators
    /// of the department concerned (the claim's, or the one given), the holders of a function of that department that carries the
    /// right <paramref name="permission"/>, and the superadmins. With no department known, every administrator is told, as a safety net.
    /// </summary>
    Task NotifyValidatorsAsync(string type, string title, string message, string? permission, Guid? departmentId = null, Guid? actionPlanId = null, Guid? claimId = null, string? linkPath = null, string? excludeUserId = null);
    Task<IEnumerable<Notification>> GetForUserAsync(string userId);
    Task<int> GetUnreadCountAsync(string userId);
    Task MarkAsReadAsync(Guid notificationId, string userId);
}