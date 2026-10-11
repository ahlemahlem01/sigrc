using System.ComponentModel.DataAnnotations;

// ActionPlanController.cs ou DTOs/AssignActionPlanDto.cs
public class AssignActionPlanDto
{
    [Required] public string UserId { get; set; } = null!;
    [Required] public string ActionPlanId { get; set; } = null!;
    [Required] public ActionPlanPermissions Permissions { get; set; } = null!;
}

public class ActionPlanPermissions
{
    public bool View { get; set; }
    public bool Edit { get; set; }
    public bool Delete { get; set; }
}

public class AssignedActionPlanDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Status { get; set; }
    public int Progress { get; set; }
    public string AssignedToId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? Deadline { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool? IsOnTime { get; set; }
    public ActionPlanPermissions Permissions { get; set; } = new();
    public string? UpdatedBy { get; set; }
    /// <summary>Who assigned the plan (UserActionPlanAssignment.AssignedBy, fallback UpdatedBy).</summary>
    public string? AssignedBy { get; set; }
    public Guid? ClaimId { get; set; }

}
