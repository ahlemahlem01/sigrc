using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Enums;
namespace Coficab.ActionPlan.Core.Entities;
public class Organization : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public OrganizationType Type { get; set; }
    public ICollection<Region> Regions { get; set; } = [];
    public ICollection<Country> Countries { get; set; } = [];
    public ICollection<Site> Sites { get; set; } = [];
    public ICollection<Department> Departments { get; set; } = [];
}