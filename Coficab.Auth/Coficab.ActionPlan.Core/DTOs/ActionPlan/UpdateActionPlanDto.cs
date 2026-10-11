using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.ActionPlan;

public class UpdateActionPlanDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ActionPlanStatus Status { get; set; }
    public ActionPlanType Type { get; set; }       // ADD — frontend sends this on update too
    public Guid OrganizationId { get; set; }       // ADD
    public Guid DepartmentId { get; set; }          // ADD — was missing entirely; you can't change department on update otherwise
    public string? AssignedToId { get; set; }       // ADD
    public DateTime? Deadline { get; set; }          // ADD
}