using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Enums;
namespace Coficab.ActionPlan.Core.Entities;
public class PlanActionHistory : BaseEntity
{
    public Guid PlanActionId { get; set; }
    public PlanAction PlanAction { get; set; } = null!;
    public string ChangedBy { get; set; } = string.Empty;
    public ActionProgress OldProgress { get; set; }
    public ActionProgress NewProgress { get; set; }
    public string? Note { get; set; }
}