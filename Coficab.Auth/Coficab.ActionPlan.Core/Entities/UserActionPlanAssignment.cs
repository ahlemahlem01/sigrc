
using System;

namespace Coficab.ActionPlan.Core.Entities;

public class UserActionPlanAssignment
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public Guid ActionPlanId { get; set; }
    public bool CanView { get; set; }
    public bool CanEdit { get; set; }
    //public bool CanDelete { get; set; }
    public DateTime CreatedAt { get; set; }
    /// <summary>User id of the person who performed the assignment (admin / quality).</summary>
    public string? AssignedBy { get; set; }

    // Navigation properties
    public virtual ActionPlan ActionPlan { get; set; } = null!;
}