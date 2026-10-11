using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class Function : BaseEntity
{
    public string FunctionCode { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? HierarchicalLink { get; set; }
    public string? FunctionalLink { get; set; }
    public string? JobDescriptionFilePath { get; set; }
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    public ICollection<UserFunction> UserFunctions { get; set; } = [];
}