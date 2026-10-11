using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.Organization;

public class OrganizationDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public OrganizationType Type { get; set; }
    public DateTime CreatedAt { get; set; }
}