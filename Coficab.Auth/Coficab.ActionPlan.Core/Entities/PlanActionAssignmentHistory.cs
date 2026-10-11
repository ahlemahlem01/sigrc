using Coficab.ActionPlan.Core.Common;

namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// Assignment audit trail for PlanAction (mirrors ActionPlanHistory assignment entries).
/// ActionType values: assigned | unassigned | reassigned
/// </summary>
public class PlanActionAssignmentHistory : BaseEntity
{
    public Guid PlanActionId { get; set; }
    public PlanAction PlanAction { get; set; } = null!;

    public string ChangedBy { get; set; } = string.Empty;
    public string? ChangedByName { get; set; }

    /// <summary>assigned | unassigned | reassigned</summary>
    public string ActionType { get; set; } = string.Empty;

    public string? OldAssignedToId { get; set; }
    public string? NewAssignedToId { get; set; }
    public string? OldAssignedToName { get; set; }
    public string? NewAssignedToName { get; set; }

    public string? Note { get; set; }
}
