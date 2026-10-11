using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.Entities;

public class PlanAction : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ActionProgress Progress { get; set; } = ActionProgress.NotStarted;
    public DateTime? Deadline { get; set; }
    public int Priority { get; set; } // 1=High 2=Medium 3=Low
    public string? AssignedToId { get; set; }          // external user id, not a local FK
    public Guid ActionPlanId { get; set; }
    public ActionPlan ActionPlan { get; set; } = null!;
    public int? Order { get; set; }                     // ADD — for drag-reorder
    public ActionPlanStatus? Status { get; set; }        // ADD — reuses existing enum
    public ICollection<ActionDocument> Documents { get; set; } = [];
    public ICollection<PlanActionHistory> History { get; set; } = [];
    public ICollection<PlanActionAssignmentHistory> AssignmentHistory { get; set; } = [];
}