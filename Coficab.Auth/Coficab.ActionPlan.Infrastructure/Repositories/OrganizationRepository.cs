
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Infrastructure.Repositories;

public class OrganizationRepository : GenericRepository<Organization>, IOrganizationRepository
{
    public OrganizationRepository(ActionPlanDbContext context) : base(context) { }

    public async Task<Organization?> GetWithFullHierarchyAsync(Guid id)
        => await _dbSet
            .Include(o => o.Regions)
            .Include(o => o.Countries)
            .Include(o => o.Sites)
            .Include(o => o.Departments)
            .FirstOrDefaultAsync(o => o.Id == id);
}