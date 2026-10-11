using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
namespace Coficab.ActionPlan.Infrastructure.Repositories;
public class PlanActionRepository : GenericRepository<PlanAction>, IPlanActionRepository
{
    public PlanActionRepository(ActionPlanDbContext context) : base(context) { }
    public async Task<IEnumerable<PlanAction>> GetByActionPlanAsync(Guid actionPlanId)
        => await _dbSet.Where(a => a.ActionPlanId == actionPlanId)
                       .Include(a => a.Documents)
                       .ToListAsync();
    public override async Task<PlanAction?> GetByIdAsync(Guid id)
    => await _dbSet
        .Include(a => a.ActionPlan)
        .FirstOrDefaultAsync(a => a.Id == id);
    public async Task<IEnumerable<PlanAction>> GetByAssignedUserAsync(string userId)
        => await _dbSet.Where(a => a.AssignedToId == userId).ToListAsync();
    public async Task<IEnumerable<PlanAction>> GetOverdueAsync()
        => await _dbSet.Where(a => a.Deadline < DateTime.UtcNow
                                && a.Progress != ActionProgress.Hundred
                                && a.Progress != ActionProgress.Validated
                                && !a.IsArchived)
                       .ToListAsync();
    public async Task<IEnumerable<PlanActionHistory>> GetHistoryAsync(Guid planActionId)
    {
        return await _context.PlanActionHistories
            .Where(h => h.PlanActionId == planActionId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();
    }

    // 🆕 NEW: persists a history entry. Previously UpdateProgressAsync built this object
    // in memory and discarded it (see TODO comment that was there) — this is the missing
    // save step, using the same _context the rest of this repository already relies on.
    public async Task AddHistoryAsync(PlanActionHistory history)
    {
        await _context.PlanActionHistories.AddAsync(history);
        await _context.SaveChangesAsync();
    }

    public async Task<IEnumerable<PlanActionAssignmentHistory>> GetAssignmentHistoryAsync(Guid planActionId)
    {
        return await _context.PlanActionAssignmentHistories
            .Where(h => h.PlanActionId == planActionId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();
    }

    public async Task AddAssignmentHistoryAsync(PlanActionAssignmentHistory history)
    {
        await _context.PlanActionAssignmentHistories.AddAsync(history);
        await _context.SaveChangesAsync();
    }

    public async Task RestoreAsync(Guid id, string restoredBy)
    {
        var action = await _dbSet.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new KeyNotFoundException($"PlanAction {id} not found");

        action.IsArchived = false;
        action.ArchivedAt = null;
        action.ArchivedBy = null;
        action.UpdatedBy = restoredBy;
        action.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }
}
