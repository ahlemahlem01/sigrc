
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Infrastructure.Repositories;

public class DepartmentRepository : GenericRepository<Department>, IDepartmentRepository
{
    public DepartmentRepository(ActionPlanDbContext context) : base(context) { }

    public async Task<IEnumerable<Department>> GetBySiteAsync(Guid siteId)
        => await _dbSet.Where(d => d.SiteId == siteId).ToListAsync();

    public async Task<IEnumerable<Department>> GetByOrganizationAsync(Guid organizationId)
        => await _dbSet.Where(d => d.OrganizationId == organizationId).ToListAsync();
}