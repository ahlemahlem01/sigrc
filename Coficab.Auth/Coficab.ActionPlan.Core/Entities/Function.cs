using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class Function : BaseEntity
{
    public string FunctionCode { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? HierarchicalLink { get; set; }
    public string? FunctionalLink { get; set; }
    public string? JobDescriptionFilePath { get; set; }
    /// <summary>Original name of the job description (PDF or Word) shown on download.</summary>
    public string? JobDescriptionFileName { get; set; }
    /// <summary>Rights the function carries, as permission codes separated by commas (see PermissionAccess). Someone holding the function (active or by interim) has them.</summary>
    public string? Permissions { get; set; }
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    public ICollection<UserFunction> UserFunctions { get; set; } = [];
}