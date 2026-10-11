
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using CoreEntities = Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Infrastructure.Repositories;

public class ActionPlanRepository : GenericRepository<CoreEntities.ActionPlan>, IActionPlanRepository
{
    public ActionPlanRepository(ActionPlanDbContext context) : base(context) { }

    public async Task<IEnumerable<CoreEntities.ActionPlan>> GetByDepartmentAsync(Guid departmentId)
        => await _dbSet.Where(ap => ap.DepartmentId == departmentId).ToListAsync();

    public async Task<IEnumerable<CoreEntities.ActionPlan>> GetByOwnerAsync(string ownerId)
        => await _dbSet.Where(ap => ap.OwnerId == ownerId).ToListAsync();

    public async Task<CoreEntities.ActionPlan?> GetWithActionsAsync(Guid id)
       => await _dbSet
           .IgnoreQueryFilters()       // ← add this
           .Include(ap => ap.PlanActions)
           .Include(ap => ap.History)
           .FirstOrDefaultAsync(ap => ap.Id == id);

    public async Task<UserActionPlanAssignment?> GetAssignmentAsync(string userId, Guid actionPlanId)
    {
        var uid = (userId ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(uid)) return null;

        return await _context.UserActionPlanAssignments
            .FirstOrDefaultAsync(a =>
                a.ActionPlanId == actionPlanId
                && a.UserId.ToLower() == uid.ToLower());
    }

    public async Task<UserActionPlanAssignment?> GetAssignmentByIdAsync(Guid id)
    {
        return await _context.UserActionPlanAssignments
            .FirstOrDefaultAsync(a => a.Id == id);
    }

    public async Task<IEnumerable<UserActionPlanAssignment>> GetUserAssignmentsAsync(string userId)
    {
        return await _context.UserActionPlanAssignments
            .Where(a => a.UserId == userId)
            .Include(a => a.ActionPlan)
             .ThenInclude(ap => ap.PlanActions)
            .ToListAsync();
    }

    public async Task AddAssignmentAsync(UserActionPlanAssignment assignment)
    {
        assignment.CreatedAt = DateTime.UtcNow;
        await _context.UserActionPlanAssignments.AddAsync(assignment);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAssignmentAsync(UserActionPlanAssignment assignment)
    {
        _context.UserActionPlanAssignments.Update(assignment);
        await _context.SaveChangesAsync();
    }

    public async Task RemoveAssignmentAsync(UserActionPlanAssignment assignment)
    {
        _context.UserActionPlanAssignments.Remove(assignment);
        await _context.SaveChangesAsync();
    }
    public async Task<IEnumerable<UserActionPlanAssignment>> GetAllAssignmentsAsync()
    {
        return await _context.UserActionPlanAssignments
            .Include(a => a.ActionPlan)
            .ToListAsync();
    }
    public new async Task<IEnumerable<CoreEntities.ActionPlan>> GetAllAsync()
    {
        return await _dbSet
               .IgnoreQueryFilters()
            .IgnoreQueryFilters()
            .Include(ap => ap.Department)
            .Include(ap => ap.PlanActions)
            .AsSplitQuery()
            .ToListAsync();
    }
    public override async Task ArchiveAsync(Guid id, string archivedBy)
    {
        var entity = await _dbSet.FirstOrDefaultAsync(e => e.Id == id);
        if (entity is null) return;

        entity.IsArchived = true;
        entity.Status = ActionPlanStatus.Archived;  // ← Set to 3
        entity.ArchivedAt = DateTime.UtcNow;
        entity.ArchivedBy = archivedBy;

        await _context.SaveChangesAsync();
    }

    Task<IEnumerable<CoreEntities.ActionPlan>> IActionPlanRepository.GetAllWithActionsAsync()
    {
        throw new NotImplementedException();
    }
    public async Task RestoreAsync(Guid id, string restoredBy)
    {
        var plan = await _context.ActionPlans.FindAsync(id)
            ?? throw new KeyNotFoundException($"ActionPlan {id} not found");

        plan.IsArchived = false;
        plan.ArchivedAt = null;
        plan.UpdatedBy = restoredBy;
        plan.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
    }
}
