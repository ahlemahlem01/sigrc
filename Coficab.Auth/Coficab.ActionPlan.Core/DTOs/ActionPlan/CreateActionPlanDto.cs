using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.ActionPlan;

public class CreateActionPlanDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ActionPlanType Type { get; set; }
    /// <summary>Business domain; empty = quality. Must be an active entry of the reference list "domain".</summary>
    public string? Domain { get; set; }
    public Guid OrganizationId { get; set; }     // ADD — frontend sends this
    public Guid DepartmentId { get; set; }
    public string? AssignedToId { get; set; }     // ADD — optional, frontend sends `|| undefined`
    public DateTime? Deadline { get; set; }        // ADD — optional
    public Guid? ClaimId { get; set; }
    /// <summary>Si renseigné, le CAPA reste lié à l'alerte et n'est jamais supprimé.</summary>
    public Guid? AlertId { get; set; }
    public List<CreatePlanActionDto>? PlanActions { get; set; }
}