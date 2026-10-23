using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.ActionPlan;

public class ActionPlanDto
{
    public Guid Id { get; set; }
   
    public string? Reference { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ActionPlanType Type { get; set; }
    public ActionPlanStatus Status { get; set; }
    public string OwnerId { get; set; } = string.Empty;
    public Guid OrganizationId { get; set; }          // ADD
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public string? AssignedToId { get; set; }          // ADD
    public DateTime? Deadline { get; set; }             // ADD
    public DateTime? CompletedAt { get; set; }
    public bool? IsOnTime { get; set; }
    public int Progress { get; set; }
    public Guid? ClaimId { get; set; }
    public string? ClaimTitle { get; set; }
    public List<PlanActionDto> PlanActions { get; set; } = new(); // ADD (if you want sub-actions to load too)
    public DateTime CreatedAt { get; set; }
    public string? CreatedBy { get; set; }
    /// <summary>The creator's current name (a merged account shows the account that replaced it).</summary>
    public string? CreatedByName { get; set; }

    // Validation queue (pending / rejected lists only)
    /// <summary>Evidence files attached to the plan's sub-actions (IATF checklist before D5 validation).</summary>
    public int ProofCount { get; set; }
    public DateTime? LastRejectedAt { get; set; }
    public string? LastRejectComment { get; set; }
}