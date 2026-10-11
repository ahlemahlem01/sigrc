
namespace Coficab.ActionPlan.Core.DTOs.ActionPlan;

public class UpdatePermissionsDto
{
    public bool CanView { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
}