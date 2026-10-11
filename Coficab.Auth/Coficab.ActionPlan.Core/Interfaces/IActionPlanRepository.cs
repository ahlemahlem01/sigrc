
using CoreEntities = Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Entities;
namespace Coficab.ActionPlan.Core.Interfaces;

public interface IActionPlanRepository : IGenericRepository<CoreEntities.ActionPlan>
{
    Task<IEnumerable<CoreEntities.ActionPlan>> GetByDepartmentAsync(Guid departmentId);
    Task<IEnumerable<CoreEntities.ActionPlan>> GetByOwnerAsync(string ownerId);
    Task<CoreEntities.ActionPlan?> GetWithActionsAsync(Guid id);
    Task RemoveAssignmentAsync(UserActionPlanAssignment assignment);

    Task<UserActionPlanAssignment?> GetAssignmentAsync(string userId, Guid actionPlanId);
    Task<UserActionPlanAssignment?> GetAssignmentByIdAsync(Guid id);
    Task<IEnumerable<UserActionPlanAssignment>> GetUserAssignmentsAsync(string userId);
    Task AddAssignmentAsync(UserActionPlanAssignment assignment);
    Task UpdateAssignmentAsync(UserActionPlanAssignment assignment);
    Task<IEnumerable<UserActionPlanAssignment>> GetAllAssignmentsAsync();
    new Task<IEnumerable<CoreEntities.ActionPlan>> GetAllAsync();
    Task<IEnumerable<CoreEntities.ActionPlan>> GetAllWithActionsAsync();
    Task RestoreAsync(Guid id, string restoredBy);

}