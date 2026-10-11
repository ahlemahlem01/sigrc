namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class AwardBadgeDto
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public string Color { get; set; } = "#3b82f6";
    public string Category { get; set; } = "general";
    public Guid? PlanId { get; set; }
    public string? PlanTitle { get; set; }
}