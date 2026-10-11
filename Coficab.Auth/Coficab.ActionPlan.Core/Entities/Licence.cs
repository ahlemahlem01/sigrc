using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class Licence : BaseEntity
{
    public string Key { get; set; } = string.Empty;
    public bool IsGlobal { get; set; } = false;
    public int MaxUsers { get; set; }
    public DateTime ExpiresAt { get; set; }
    public Guid? SiteId { get; set; }
    public Site? Site { get; set; }
}