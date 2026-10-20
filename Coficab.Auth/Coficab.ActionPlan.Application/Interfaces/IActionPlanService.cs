using Coficab.ActionPlan.Core.DTOs.ActionPlan;
using Coficab.ActionPlan.Core.Entities;
namespace Coficab.ActionPlan.Application.Interfaces;
public interface IActionPlanService
{
    Task<IEnumerable<ActionPlanDto>> GetAllAsync();
    /// <summary>
    /// SuperAdmin : tous les plans de son organisation.
    /// Admin : plans créés, assignés, ou du même département.
    /// </summary>
    Task<IEnumerable<ActionPlanDto>> GetVisibleAsync(string userId, bool superAdmin, bool includeActions = false);
    Task<HashSet<Guid>> GetVisibleIdsAsync(string userId, bool superAdmin);
    /// <summary>Champs affichés par le pilotage, sans le graphe complet des plans.</summary>
    Task<IReadOnlyList<SteeringPlanDto>> GetSteeringAsync(string userId, bool superAdmin);
    Task<ActionPlanDto?> GetByIdAsync(Guid id);
    Task<ActionPlanDto> CreateAsync(CreateActionPlanDto dto, string createdBy);
    Task<ActionPlanDto> UpdateAsync(Guid id, UpdateActionPlanDto dto, string updatedBy);
    /// <summary>Sends a warning about a plan to one person (notification) and keeps it in the plan history.</summary>
    Task WarnAsync(Guid planId, string toUserId, string message, string sentBy);
    Task ArchiveAsync(Guid id, string archivedBy);
    Task<IEnumerable<ActionPlanDto>> GetByDepartmentAsync(Guid departmentId);
    Task<IEnumerable<ActionPlanDto>> GetByOwnerAsync(string ownerId);
    Task<bool> ExistsAsync(Guid id);
    Task<object> AssignToUserAsync(AssignActionPlanDto dto, string? assignedBy = null);
    Task<IEnumerable<AssignedActionPlanDto>> GetUserAssignedPlansAsync(string userId);
    Task<AssignedActionPlanDto?> GetAssignedPlanByIdAsync(Guid planId, string userId);
    Task<bool> UpdateAssignedPermissionsAsync(Guid assignmentId, UpdatePermissionsDto dto);
    Task<bool> UnassignFromUserAsync(Guid userId, Guid actionPlanId);
    Task<IEnumerable<AssignedActionPlanDto>> GetAllAssignmentsAsync();

    // 🆕 NEW: Employee-facing — marks a plan with ZERO sub-actions as "done,
    // pending validation". Status stays Ongoing; UpdatedBy is set to the
    // employee's id so the frontend can render the pending-validation state.
    // Plans WITH sub-actions must be progressed via PlanAction updates instead.
    Task<bool> CloseEmptyAssignedPlanAsync(Guid planId, string userId);
    Task UpdateAssignedPlanProgressAsync(Guid planId, string userId, int progress);

    Task<IEnumerable<ActionPlanHistory>> GetPlanHistoryAsync(Guid planId);
    Task RestoreAsync(Guid id, string restoredBy);
   // Task<IEnumerable<ActionPlanHistory>> GetAllHistoryAsync();
    Task<IEnumerable<ActionPlanHistoryDto>> GetAllHistoryAsync();
    Task<IEnumerable<ActionPlanDto>> GetPendingValidationAsync();
    /// <summary>Sends a plan awaiting validation back to its assignee with a reason.</summary>
    Task RejectAsync(Guid planId, string adminId, string comment);
    /// <summary>Plans sent back and not yet resubmitted: the caller's own, or every visible one for an admin.</summary>
    Task<IEnumerable<ActionPlanDto>> GetRejectedAsync(string userId, bool qualityAdmin, bool superAdmin);
    /// <summary>Employee puts a rejected plan back into the validation queue once every sub-action is done.</summary>
    Task ResubmitAsync(Guid planId, string userId);
    Task<IEnumerable<ActionPlanDto>> GetByClaimIdAsync(Guid claimId);

    /// <summary>
    /// Clôture tous les plans ouverts (Created/Ongoing) liés à une réclamation.
    /// Utilisé à la clôture du dossier / réclamation pour éviter des CAPA « En cours »
    /// rattachées à un dossier déjà clôturé.
    /// </summary>
    Task<int> CloseOpenPlansForClaimAsync(Guid claimId, string closedBy, string? note = null);

    /// <summary>
    /// Répare les CAPA encore ouvertes alors que leur réclamation est déjà clôturée.
    /// </summary>
    Task<int> CloseOrphanPlansForClosedClaimsAsync(string closedBy = "system");
}