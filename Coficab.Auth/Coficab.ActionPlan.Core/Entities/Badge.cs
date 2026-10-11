namespace Coficab.ActionPlan.Core.Entities;

public class Badge
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public string Color { get; set; } = "#3b82f6";
    public DateTime EarnedAt { get; set; } = DateTime.UtcNow;

    // Link to completed plan (optional)
    public Guid? PlanId { get; set; }
    public string? PlanTitle { get; set; }

    // Badge type/category
    public string Category { get; set; } = "general"; // first_plan, streak, speed, perfect_quarter
}