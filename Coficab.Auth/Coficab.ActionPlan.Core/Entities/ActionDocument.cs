using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class ActionDocument : BaseEntity
{
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public string UploadedBy { get; set; } = string.Empty;
    public Guid PlanActionId { get; set; }
    public PlanAction PlanAction { get; set; } = null!;
}