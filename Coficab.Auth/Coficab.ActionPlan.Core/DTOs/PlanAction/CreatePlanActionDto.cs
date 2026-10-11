namespace Coficab.ActionPlan.Core.DTOs.PlanAction;

public class CreatePlanActionDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime? Deadline { get; set; }
    public int Priority { get; set; }
    public string? AssignedToId { get; set; }
    public Guid ActionPlanId { get; set; }
    public int? Order { get; set; }
}