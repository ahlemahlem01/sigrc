using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.Entities;

public class ActionPlan : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ActionPlanType Type { get; set; }
    public ActionPlanStatus Status { get; set; } = ActionPlanStatus.Created;
    public string OwnerId { get; set; } = string.Empty;

    public Guid OrganizationId { get; set; }              // ADD
    public Organization Organization { get; set; } = null!; // ADD

    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    public string? AssignedToId { get; set; }              // ADD
    public DateTime? Deadline { get; set; }                  // ADD
    public Guid? ClaimId { get; set; }
    /// <summary>CAPA issu d'une alerte. Archivé, jamais supprimé.</summary>
    public Guid? AlertId { get; set; }

    /// <summary>Set automatically when status becomes Closed.</summary>
    public DateTime? CompletedAt { get; set; }
    /// <summary>CompletedAt &lt;= Deadline at closure time; null if no deadline.</summary>
    public bool? IsOnTime { get; set; }

    public ICollection<PlanAction> PlanActions { get; set; } = []; // keep ONE of these, drop "Actions"
    public ICollection<ActionPlanHistory> History { get; set; } = [];
    public virtual ICollection<UserActionPlanAssignment> UserAssignments { get; set; } = []; // keep only if you need multi-assignment elsewhere
    public int Progress { get; set; } = 0;
}
