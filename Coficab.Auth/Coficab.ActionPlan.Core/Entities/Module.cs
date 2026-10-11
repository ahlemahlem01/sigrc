using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class Module : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}