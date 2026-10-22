using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Core.Interfaces;

namespace Coficab.ActionPlan.Application.Services;

public class PlanActionService : IPlanActionService
{
    private readonly IPlanActionRepository _repo;
    private readonly IActionPlanRepository _actionPlanRepo;
    private readonly IMapper _mapper;
    private readonly INotificationService _notificationService;
    private readonly IUserRepository _userRepo;
    private readonly ITimelineService _timelineService; // ← nouveau

    public PlanActionService(
        IPlanActionRepository repo,
        IActionPlanRepository actionPlanRepo,
        IMapper mapper,
        INotificationService notificationService,
        IUserRepository userRepo,
        ITimelineService timelineService) // ← nouveau
    {
        _repo = repo;
        _actionPlanRepo = actionPlanRepo;
        _mapper = mapper;
        _notificationService = notificationService;
        _userRepo = userRepo;
        _timelineService = timelineService; // ← nouveau
    }

    public async Task<IEnumerable<PlanActionDto>> GetByActionPlanAsync(Guid actionPlanId)
    {
        var actions = await _repo.GetByActionPlanAsync(actionPlanId);
        return _mapper.Map<IEnumerable<PlanActionDto>>(actions);
    }

    public async Task<IEnumerable<PlanActionDto>> GetByAssignedUserAsync(string userId)
    {
        var actions = await _repo.GetByAssignedUserAsync(userId);
        return _mapper.Map<IEnumerable<PlanActionDto>>(actions);
    }

    public async Task<PlanActionDto?> GetByIdAsync(Guid id)
    {
        var action = await _repo.GetByIdAsync(id);
        return action is null ? null : _mapper.Map<PlanActionDto>(action);
    }

    public async Task<PlanActionDto> CreateAsync(CreatePlanActionDto dto, string createdBy)
    {
        var action = _mapper.Map<PlanAction>(dto);
        action.CreatedBy = createdBy;
        action.Progress = ActionProgress.NotStarted;
        await _repo.AddAsync(action);

        if (!string.IsNullOrWhiteSpace(action.AssignedToId))
        {
            await _repo.AddAssignmentHistoryAsync(BuildAssignmentHistory(
                action.Id,
                createdBy,
                actionType: "assigned",
                oldAssignedToId: null,
                newAssignedToId: action.AssignedToId,
                note: "Assignation initiale"));
        }

        return _mapper.Map<PlanActionDto>(action);
    }

    public async Task<PlanActionDto> UpdateAsync(Guid id, UpdatePlanActionDto dto, string updatedBy)
    {
        var action = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"PlanAction {id} not found");

        var oldAssignedToId = action.AssignedToId;
        _mapper.Map(dto, action);
        action.UpdatedBy = updatedBy;
        await _repo.UpdateAsync(action);

        if (!string.Equals(oldAssignedToId, action.AssignedToId, StringComparison.Ordinal))
        {
            var actionType = string.IsNullOrEmpty(oldAssignedToId) ? "assigned"
                : string.IsNullOrEmpty(action.AssignedToId) ? "unassigned"
                : "reassigned";

            await _repo.AddAssignmentHistoryAsync(BuildAssignmentHistory(
                action.Id,
                updatedBy,
                actionType,
                oldAssignedToId,
                action.AssignedToId,
                note: "Assignation modifiee"));
        }

        return _mapper.Map<PlanActionDto>(action);
    }

    public async Task UpdateProgressAsync(Guid id, UpdateProgressDto dto, string updatedBy)
    {
        var action = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"PlanAction {id} not found");

        if (action.Progress == ActionProgress.Validated ||
            action.Progress == ActionProgress.Cancelled)
            throw new InvalidOperationException("Cette sous-action est verrouillée.");

        if (dto.Progress < 0 || dto.Progress > 100)
            throw new InvalidOperationException("La progression doit être entre 0 et 100.");

        var oldProgress = action.Progress;
        var newProgress = (ActionProgress)dto.Progress;

        var history = new PlanActionHistory
        {
            Id = Guid.NewGuid(),
            PlanActionId = id,
            ChangedBy = updatedBy,
            OldProgress = oldProgress,
            NewProgress = newProgress,
            Note = dto.Note,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = updatedBy,
            UpdatedAt = DateTime.UtcNow,
            UpdatedBy = updatedBy
        };

        action.Progress = newProgress;
        action.UpdatedBy = updatedBy;
        action.UpdatedAt = DateTime.UtcNow;

        await _repo.UpdateAsync(action);
        await _repo.AddHistoryAsync(history);

        var plan = await _actionPlanRepo.GetWithActionsAsync(action.ActionPlanId);
        Console.WriteLine($"[NOTIFY] plan={plan?.Title}, createdBy={plan?.CreatedBy}, updatedBy={updatedBy}");

        if (plan != null && !string.IsNullOrEmpty(plan.CreatedBy) && plan.CreatedBy != updatedBy)
        {
            Console.WriteLine($"[NOTIFY] Calling NotifyAsync for {plan.CreatedBy}");
            await _notificationService.NotifyAsync(
                plan.CreatedBy,
                "progress_updated",
                "Progression mise à jour",
                $"La sous-action « {action.Title} » a été mise à jour à {dto.Progress}%.",
                action.ActionPlanId);
            Console.WriteLine($"[NOTIFY] Done");
        }
        else
        {
            Console.WriteLine($"[NOTIFY] Skipped — same user or plan null");
        }

        if (newProgress > ActionProgress.NotStarted && action.ActionPlan?.Status == ActionPlanStatus.Created)
            await CheckAndSetOngoingAsync(action.ActionPlanId, updatedBy);

        await CheckAndCloseActionPlanAsync(action.ActionPlanId, updatedBy);
    }

    public async Task ValidateAsync(Guid id, string validatedBy, string? note)
    {
        var action = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"PlanAction {id} not found");

        if (action.Progress == ActionProgress.Validated)
            throw new InvalidOperationException("Cette sous-action est déjà validée.");
        if (action.Progress == ActionProgress.Cancelled)
            throw new InvalidOperationException("Cette sous-action est annulée.");
        if (action.Progress != ActionProgress.Hundred)
            throw new InvalidOperationException("Seule une sous-action terminée à 100 % peut être validée.");

        var now = DateTime.UtcNow;
        var history = new PlanActionHistory
        {
            Id = Guid.NewGuid(),
            PlanActionId = id,
            ChangedBy = validatedBy,
            OldProgress = ActionProgress.Hundred,
            NewProgress = ActionProgress.Validated,
            Note = string.IsNullOrWhiteSpace(note) ? "Validée par l'administrateur." : note,
            CreatedAt = now,
            CreatedBy = validatedBy,
            UpdatedAt = now,
            UpdatedBy = validatedBy
        };

        action.Progress = ActionProgress.Validated;
        action.UpdatedBy = validatedBy;
        action.UpdatedAt = now;

        await _repo.UpdateAsync(action);
        await _repo.AddHistoryAsync(history);

        if (!string.IsNullOrEmpty(action.AssignedToId) && action.AssignedToId != validatedBy)
        {
            await _notificationService.NotifyAsync(
                action.AssignedToId,
                "action_validated",
                "Sous-action validée",
                $"La sous-action « {action.Title} » a été validée.",
                action.ActionPlanId);
        }
    }

    public async Task RejectAsync(Guid id, string rejectedBy, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
            throw new InvalidOperationException("Indiquez le motif du rejet.");

        var action = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"PlanAction {id} not found");

        if (action.Progress == ActionProgress.Validated)
            throw new InvalidOperationException("Cette sous-action est déjà validée : elle est verrouillée.");
        if (action.Progress != ActionProgress.Hundred)
            throw new InvalidOperationException("Seule une sous-action terminée à 100 % peut être rejetée.");

        var now = DateTime.UtcNow;
        var history = new PlanActionHistory
        {
            Id = Guid.NewGuid(),
            PlanActionId = id,
            ChangedBy = rejectedBy,
            OldProgress = ActionProgress.Hundred,
            NewProgress = ActionProgress.SeventyFive,
            Note = $"Rejetée : {reason.Trim()}",
            CreatedAt = now,
            CreatedBy = rejectedBy,
            UpdatedAt = now,
            UpdatedBy = rejectedBy
        };

        action.Progress = ActionProgress.SeventyFive;
        action.UpdatedBy = rejectedBy;
        action.UpdatedAt = now;

        await _repo.UpdateAsync(action);
        await _repo.AddHistoryAsync(history);

        if (!string.IsNullOrEmpty(action.AssignedToId) && action.AssignedToId != rejectedBy)
        {
            await _notificationService.NotifyAsync(
                action.AssignedToId,
                "action_rejected",
                "Sous-action rejetée",
                $"La sous-action « {action.Title} » a été renvoyée en cours. Motif : {reason.Trim()}",
                action.ActionPlanId);
        }
    }

    public async Task WarnAsync(Guid id, string warnedBy, string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            throw new InvalidOperationException("Écrivez le message d'avertissement.");

        var action = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"PlanAction {id} not found");

        if (string.IsNullOrEmpty(action.AssignedToId))
            throw new InvalidOperationException("Cette sous-action n'a pas de responsable à prévenir.");

        await _notificationService.NotifyAsync(
            action.AssignedToId,
            "action_warning",
            "Avertissement",
            $"À propos de la sous-action « {action.Title} » : {message.Trim()}",
            action.ActionPlanId);

        var now = DateTime.UtcNow;
        await _repo.AddHistoryAsync(new PlanActionHistory
        {
            Id = Guid.NewGuid(),
            PlanActionId = id,
            ChangedBy = warnedBy,
            OldProgress = action.Progress,
            NewProgress = action.Progress,
            Note = $"Avertissement : {message.Trim()}",
            CreatedAt = now,
            CreatedBy = warnedBy,
            UpdatedAt = now,
            UpdatedBy = warnedBy,
        });
    }

    public async Task ArchiveAsync(Guid id, string archivedBy)
        => await _repo.ArchiveAsync(id, archivedBy);

    public async Task RestoreAsync(Guid id, string restoredBy)
        => await _repo.RestoreAsync(id, restoredBy);

    public async Task<IEnumerable<PlanActionDto>> GetOverdueAsync()
    {
        var actions = await _repo.GetOverdueAsync();
        return _mapper.Map<IEnumerable<PlanActionDto>>(actions);
    }

    public async Task<IEnumerable<PlanActionHistory>> GetProgressHistoryAsync(Guid planActionId)
        => await _repo.GetHistoryAsync(planActionId);

    public async Task<IEnumerable<PlanActionAssignmentHistory>> GetAssignmentHistoryAsync(Guid planActionId)
        => await _repo.GetAssignmentHistoryAsync(planActionId);

    public async Task<bool> CanEditProgressAsync(Guid planActionId, string userId)
    {
        var action = await _repo.GetByIdAsync(planActionId);
        if (action == null) return false;

        var actionPlan = await _actionPlanRepo.GetWithActionsAsync(action.ActionPlanId);
        if (actionPlan == null) return false;

        var isAssigned = actionPlan.UserAssignments.Any(a => a.UserId == userId);
        if (!isAssigned) return false;

        return action.Progress != ActionProgress.Validated
            && action.Progress != ActionProgress.Cancelled;
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    private async Task CheckAndSetOngoingAsync(Guid actionPlanId, string updatedBy)
    {
        var plan = await _actionPlanRepo.GetWithActionsAsync(actionPlanId);
        if (plan == null || plan.Status != ActionPlanStatus.Created) return;

        plan.Status = ActionPlanStatus.Ongoing;
        plan.UpdatedBy = updatedBy;
        plan.UpdatedAt = DateTime.UtcNow;
        await _actionPlanRepo.UpdateAsync(plan);
    }

    private async Task CheckAndCloseActionPlanAsync(Guid actionPlanId, string updatedBy)
    {
        var plan = await _actionPlanRepo.GetWithActionsAsync(actionPlanId);
        if (plan == null || plan.Status != ActionPlanStatus.Ongoing) return;

        var activeActions = plan.PlanActions.Where(a => !a.IsArchived).ToList();
        if (!activeActions.Any()) return;

        var avgProgress = (int)Math.Round(activeActions.Average(a => (double)(int)a.Progress));
        var wasAlready100 = plan.Progress == 100;
        plan.Progress = avgProgress;
        plan.UpdatedBy = updatedBy;
        plan.UpdatedAt = DateTime.UtcNow;
        await _actionPlanRepo.UpdateAsync(plan);

        var allDone = activeActions.All(a =>
            a.Progress == ActionProgress.Hundred ||
            a.Progress == ActionProgress.Validated);

        if (!allDone || wasAlready100) return;

        // ── Auto-log completion dans la timeline de chaque employé assigné ──
        // Déclenché une seule fois quand toutes les sous-actions passent à 100%
        foreach (var assignment in plan.UserAssignments)
        {
            await _timelineService.AutoLogPlanCompletedAsync(
                assignment.UserId,
                plan.Id,
                plan.Title);
        }

        // Notifier les admins
        var adminIds = await _userRepo.GetUserIdsByRoleAsync("admin");
        var superadminIds = await _userRepo.GetUserIdsByRoleAsync("superadmin");

        foreach (var adminId in adminIds.Concat(superadminIds).Distinct())
        {
            await _notificationService.NotifyAsync(
                adminId,
                "plan_ready_for_validation",
                "Plan a valider",
                $"Le plan « {plan.Title} » est termine et attend votre validation.",
                actionPlanId);
        }
    }

    private static PlanActionAssignmentHistory BuildAssignmentHistory(
        Guid planActionId,
        string changedBy,
        string actionType,
        string? oldAssignedToId,
        string? newAssignedToId,
        string? note)
    {
        return new PlanActionAssignmentHistory
        {
            Id = Guid.NewGuid(),
            PlanActionId = planActionId,
            ChangedBy = changedBy,
            ActionType = actionType,
            OldAssignedToId = oldAssignedToId,
            NewAssignedToId = newAssignedToId,
            Note = note,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = changedBy,
            UpdatedAt = DateTime.UtcNow,
            UpdatedBy = changedBy,
        };
    }
}