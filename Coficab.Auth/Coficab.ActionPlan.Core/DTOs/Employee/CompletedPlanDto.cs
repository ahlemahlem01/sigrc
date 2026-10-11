namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class CompletedPlanDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string CompletedAt { get; set; } = string.Empty;
    public string PlanType { get; set; } = string.Empty;
    public string Duration { get; set; } = string.Empty;
    public bool? IsOnTime { get; set; }
}
