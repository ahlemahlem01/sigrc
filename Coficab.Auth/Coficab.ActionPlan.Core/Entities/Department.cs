using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class Department : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? SiteId { get; set; }
    public Site? Site { get; set; }
    public Guid? RegionId { get; set; }
    public Region? Region { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;
    public ICollection<Function> Functions { get; set; } = [];
    public ICollection<ActionPlan> ActionPlans { get; set; } = [];
}