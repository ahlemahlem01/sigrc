using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.PlanAction;

public class UpdatePlanActionDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ActionProgress Progress { get; set; }
    public DateTime? Deadline { get; set; }
    public int Priority { get; set; }
    public string? AssignedToId { get; set; }
    public int? Order { get; set; }
    public ActionPlanStatus? Status { get; set; }
}