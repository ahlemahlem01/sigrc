namespace Coficab.ActionPlan.Core.Entities;

public class TimelineEvent
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;

    // Event type: completion, assignment, comment, badge, announcement, progress_update
    public string Type { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    // Optional links
    public Guid? PlanId { get; set; }
    public string? PlanTitle { get; set; }
    public Guid? BadgeId { get; set; }
    public string? ActorName { get; set; } // who triggered the event
}