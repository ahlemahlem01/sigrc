namespace Coficab.ActionPlan.Core.DTOs.Employee;



public class BadgeDto

{

    public string Id { get; set; } = string.Empty;

    public string UserId { get; set; } = string.Empty;

    public string? UserName { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    public string? TypeLabel { get; set; }

    public string EarnedAt { get; set; } = string.Empty;

    public string? PlanId { get; set; }

    public string? PlanTitle { get; set; }

    public string Color { get; set; } = "#3b82f6";

}

