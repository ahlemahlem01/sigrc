using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.PlanAction;

public class PlanActionDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ActionProgress Progress { get; set; }
    public DateTime? Deadline { get; set; }
    public int Priority { get; set; }
    public string? AssignedToId { get; set; }
    /// <summary>The assignee's current name (filled by the plan's action list).</summary>
    public string? AssignedToName { get; set; }
    // AssignedTo (full User object) removed — no backend fetch capability yet.
    // Frontend already resolves the user via its own `users` list using AssignedToId.
    public Guid ActionPlanId { get; set; }
    public int? Order { get; set; }
    public ActionPlanStatus? Status { get; set; }
    public DateTime CreatedAt { get; set; }
}