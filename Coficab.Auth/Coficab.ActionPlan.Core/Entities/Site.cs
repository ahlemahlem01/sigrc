using Coficab.ActionPlan.Core.Common;
namespace Coficab.ActionPlan.Core.Entities;
public class Site : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    /// <summary>Null when the organization has no country level (Local, Corporate, Regional + Corporate).</summary>
    public Guid? CountryId { get; set; }
    public Country? Country { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;
    public ICollection<Department> Departments { get; set; } = [];
    public ICollection<Licence> Licences { get; set; } = [];
}