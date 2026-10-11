using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.Organization;

public class CreateOrganizationDto
{
    public string Name { get; set; } = string.Empty;
    public OrganizationType Type { get; set; }
}