namespace Coficab.ActionPlan.Core.DTOs.Department;

public class UpdateDepartmentDto
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? SiteId { get; set; }
    public Guid? RegionId { get; set; }
}