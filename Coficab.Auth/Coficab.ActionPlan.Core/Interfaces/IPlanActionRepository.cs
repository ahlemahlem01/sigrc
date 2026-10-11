using Coficab.ActionPlan.Core.Entities;
namespace Coficab.ActionPlan.Core.Interfaces;
public interface IPlanActionRepository : IGenericRepository<PlanAction>
{
    Task<IEnumerable<PlanAction>> GetByActionPlanAsync(Guid actionPlanId);
    Task<IEnumerable<PlanAction>> GetByAssignedUserAsync(string userId);
    Task<IEnumerable<PlanAction>> GetOverdueAsync();
    // NEW - pour l'historique de progression
    Task<IEnumerable<PlanActionHistory>> GetHistoryAsync(Guid planActionId);
    Task AddHistoryAsync(PlanActionHistory history);
    // Historique d'assignation (AssignedToId)
    Task<IEnumerable<PlanActionAssignmentHistory>> GetAssignmentHistoryAsync(Guid planActionId);
    Task AddAssignmentHistoryAsync(PlanActionAssignmentHistory history);
    Task RestoreAsync(Guid id, string restoredBy);
}
