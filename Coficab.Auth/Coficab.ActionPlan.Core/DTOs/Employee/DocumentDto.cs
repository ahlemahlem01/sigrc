namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class DocumentDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string LastViewed { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public string? UserId { get; set; }
    public string? Category { get; set; }
    public string? CreatedBy { get; set; }
    public string? FilePath { get; set; }
    public string? Description { get; set; }
    public string? CreatedAt { get; set; }
}