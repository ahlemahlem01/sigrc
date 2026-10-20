namespace Coficab.ActionPlan.Core.DTOs.ActionPlan;

public class BulkAssignDto
{
    public List<Guid> PlanIds { get; set; } = new();
    public string UserId { get; set; } = string.Empty;
}
