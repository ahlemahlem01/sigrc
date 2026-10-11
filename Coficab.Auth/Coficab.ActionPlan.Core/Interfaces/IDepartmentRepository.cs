
using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Core.Interfaces;

public interface IDepartmentRepository : IGenericRepository<Department>
{
    Task<IEnumerable<Department>> GetBySiteAsync(Guid siteId);
    Task<IEnumerable<Department>> GetByOrganizationAsync(Guid organizationId);
}