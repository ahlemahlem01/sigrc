using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Enums;
namespace Coficab.ActionPlan.Core.Entities;
public class UserFunction : BaseEntity
{
    public string UserId { get; set; } = string.Empty;
    public Guid FunctionId { get; set; }
    public Function Function { get; set; } = null!;
    public FunctionStatus Status { get; set; } = FunctionStatus.Active;
    public DateTime HireDate { get; set; }
}