using Coficab.ActionPlan.Core.DTOs.ActionPlan;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface IPlanActionService
{
    Task<IEnumerable<PlanActionDto>> GetByActionPlanAsync(Guid actionPlanId);
    Task<IEnumerable<PlanActionDto>> GetByAssignedUserAsync(string userId);
    Task<PlanActionDto?> GetByIdAsync(Guid id);
    Task<PlanActionDto> CreateAsync(CreatePlanActionDto dto, string createdBy);
    Task<PlanActionDto> UpdateAsync(Guid id, UpdatePlanActionDto dto, string updatedBy);

    // SINGLE UpdateProgress - avec DTO pour l'historique
    Task UpdateProgressAsync(Guid id, UpdateProgressDto dto, string updatedBy);

    Task ArchiveAsync(Guid id, string archivedBy);
    Task RestoreAsync(Guid id, string restoredBy);
    Task<IEnumerable<PlanActionDto>> GetOverdueAsync();

    // History & permissions
    Task<IEnumerable<PlanActionHistory>> GetProgressHistoryAsync(Guid planActionId);
    Task<IEnumerable<PlanActionAssignmentHistory>> GetAssignmentHistoryAsync(Guid planActionId);
    Task<bool> CanEditProgressAsync(Guid planActionId, string userId);
}