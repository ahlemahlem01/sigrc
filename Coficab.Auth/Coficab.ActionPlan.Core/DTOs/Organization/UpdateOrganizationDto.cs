using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.Organization;

public class UpdateOrganizationDto
{
    public string Name { get; set; } = string.Empty;
    public OrganizationType Type { get; set; }
}