using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class Region : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;
    public ICollection<Country> Countries { get; set; } = [];
    public ICollection<Department> Departments { get; set; } = [];
}