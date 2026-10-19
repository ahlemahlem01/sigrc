namespace Coficab.ActionPlan.Core.DTOs.ActionPlan;

public class SteeringPlanDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public int Type { get; set; }
    public int Status { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public Guid OrganizationId { get; set; }
    public DateTime? Deadline { get; set; }
    public int Progress { get; set; }
    public string? AssignedToId { get; set; }
    public Guid? ClaimId { get; set; }
    public string? ClaimTitle { get; set; }
    public List<SteeringActionDto> PlanActions { get; set; } = [];
}

public class SteeringActionDto
{
    public Guid Id { get; set; }
    public Guid ActionPlanId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int Progress { get; set; }
    public int Priority { get; set; }
    public DateTime? Deadline { get; set; }
    public string? AssignedToId { get; set; }
}
