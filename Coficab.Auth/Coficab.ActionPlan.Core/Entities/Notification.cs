// Core/Entities/Notification.cs
using Coficab.ActionPlan.Core.Common;

namespace Coficab.ActionPlan.Core.Entities;

public class Notification : BaseEntity
{
    public string RecipientId { get; set; } = string.Empty;   // à qui la notif est destinée
    public string Type { get; set; } = string.Empty;          // "plan_ready_for_validation", "plan_validated"
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public Guid? ActionPlanId { get; set; }
    public ActionPlan? ActionPlan { get; set; }
    public Guid? ClaimId { get; set; }
    public string? LinkPath { get; set; }
    /// <summary>Raw facts of the notification (dates, title, reason) so each reader's screen writes it in their own language; Title and Message stay as the fallback text.</summary>
    public string? DataJson { get; set; }
    public bool IsRead { get; set; } = false;
    public DateTime? ReadAt { get; set; }
}