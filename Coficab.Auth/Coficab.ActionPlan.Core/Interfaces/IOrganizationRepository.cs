
using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Core.Interfaces;

public interface IOrganizationRepository : IGenericRepository<Organization>
{
    Task<Organization?> GetWithFullHierarchyAsync(Guid id);
}