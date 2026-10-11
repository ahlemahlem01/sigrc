namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class TimelineEventDto
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // completion, assignment, comment, badge, announcement
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
    public string? PlanId { get; set; }
    public string? PlanTitle { get; set; }
    public string? ActorName { get; set; }
}