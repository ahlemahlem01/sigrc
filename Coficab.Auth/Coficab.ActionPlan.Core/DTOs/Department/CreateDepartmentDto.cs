namespace Coficab.ActionPlan.Core.DTOs.Department;

public class CreateDepartmentDto
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? SiteId { get; set; }
    public Guid? RegionId { get; set; }
    public Guid OrganizationId { get; set; }
}