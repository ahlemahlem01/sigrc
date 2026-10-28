using AutoMapper;
using Coficab.ActionPlan.Application.DomainEvents;
using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.DTOs.ActionPlan;
using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.EntityFrameworkCore;
using CoreEntities = Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Services;

public class ActionPlanService : IActionPlanService
{
    private readonly IActionPlanRepository _repo;
    private readonly IUserRepository _userRepo;
    private readonly IGenericRepository<ActionPlanHistory> _historyRepo;
    private readonly IMapper _mapper;
    private readonly IApplicationDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly INotificationBroadcaster _realtime;
    private readonly ISemanticSearchService _semanticSearch;
    private readonly ITimelineService _timelineService;
    private readonly IAlertHistoryService _alertHistory;
    private readonly IDomainEventPublisher _events;

    public ActionPlanService(
        IActionPlanRepository repo,
        IMapper mapper,
        IUserRepository userRepo,
        IGenericRepository<ActionPlanHistory> historyRepo,
        IPlanActionService planActionService,
        IApplicationDbContext context,
        INotificationService notificationService,
        INotificationBroadcaster realtime,
        ISemanticSearchService semanticSearch,
        ITimelineService timelineService,
        IAlertHistoryService alertHistory,
        IDomainEventPublisher events)
    {
        _repo = repo;
        _mapper = mapper;
        _userRepo = userRepo;
        _historyRepo = historyRepo;
        _context = context;
        _notificationService = notificationService;
        _realtime = realtime;
        _semanticSearch = semanticSearch;
        _timelineService = timelineService;
        _alertHistory = alertHistory;
        _events = events;
    }

    private static DateTime _lastOrphanHealUtc = DateTime.MinValue;
    private static readonly SemaphoreSlim _orphanHealLock = new(1, 1);

    public async Task<IEnumerable<ActionPlanDto>> GetAllAsync()
    {
        await HealOrphansThrottledAsync();
        var plans = await _repo.GetAllAsync();
        return _mapper.Map<IEnumerable<ActionPlanDto>>(plans);
    }

    public async Task<IEnumerable<ActionPlanDto>> GetVisibleAsync(string userId, bool superAdmin, bool includeActions = false)
    {
        await HealOrphansThrottledAsync();
        var ids = await GetVisibleIdsAsync(userId, superAdmin);
        if (ids.Count == 0)
            return Array.Empty<ActionPlanDto>();

        var plans = await _context.ActionPlans
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Include(p => p.Department)
            .Where(p => ids.Contains(p.Id))
            .ToListAsync();

        var dtos = _mapper.Map<List<ActionPlanDto>>(plans);
        if (includeActions)
        {
            var slim = await _context.PlanActions.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(a => ids.Contains(a.ActionPlanId) && !a.IsArchived)
                .Select(a => new PlanActionDto
                {
                    Id = a.Id,
                    ActionPlanId = a.ActionPlanId,
                    Title = a.Title,
                    Progress = a.Progress,
                    Deadline = a.Deadline,
                    Priority = a.Priority,
                    AssignedToId = a.AssignedToId,
                    Status = a.Status,
                    CreatedAt = a.CreatedAt
                })
                .ToListAsync();
            var byPlan = slim.GroupBy(a => a.ActionPlanId).ToDictionary(g => g.Key, g => g.ToList());
            foreach (var dto in dtos)
            {
                if (byPlan.TryGetValue(dto.Id, out var actions))
                    dto.PlanActions = actions;
            }
        }

        var claimIds = dtos.Where(d => d.ClaimId.HasValue).Select(d => d.ClaimId!.Value).Distinct().ToList();
        if (claimIds.Count > 0)
        {
            var claims = await _context.Claims.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(c => claimIds.Contains(c.Id))
                .Select(c => new { c.Id, c.Title, c.LotNumber })
                .ToListAsync();
            var byId = claims.ToDictionary(c => c.Id);
            foreach (var dto in dtos)
            {
                if (dto.ClaimId is not Guid claimId || !byId.TryGetValue(claimId, out var claim))
                    continue;
                dto.ClaimTitle = string.IsNullOrWhiteSpace(claim.Title) ? claim.LotNumber : claim.Title.Trim();
            }
        }

        return dtos;
    }

    public async Task<IReadOnlyList<SteeringPlanDto>> GetSteeringAsync(string userId, bool superAdmin)
    {
        var ids = await GetVisibleIdsAsync(userId, superAdmin);
        if (ids.Count == 0)
            return Array.Empty<SteeringPlanDto>();

        var plans = await _context.ActionPlans.AsNoTracking()
            .IgnoreQueryFilters()
            .Where(p => ids.Contains(p.Id) && !p.IsArchived)
            .Select(p => new SteeringPlanDto
            {
                Id = p.Id,
                Title = p.Title,
                Type = (int)p.Type,
                Domain = p.Domain,
                Status = (int)p.Status,
                DepartmentName = p.Department.Name,
                OrganizationId = p.OrganizationId,
                Deadline = p.Deadline,
                Progress = p.Progress,
                AssignedToId = p.AssignedToId,
                ClaimId = p.ClaimId
            })
            .ToListAsync();

        var actions = await _context.PlanActions.AsNoTracking()
            .IgnoreQueryFilters()
            .Where(a => ids.Contains(a.ActionPlanId) && !a.IsArchived)
            .Select(a => new SteeringActionDto
            {
                Id = a.Id,
                ActionPlanId = a.ActionPlanId,
                Title = a.Title,
                Progress = (int)a.Progress,
                Priority = a.Priority,
                Deadline = a.Deadline,
                AssignedToId = a.AssignedToId
            })
            .ToListAsync();

        var claimIds = plans.Where(p => p.ClaimId.HasValue).Select(p => p.ClaimId!.Value).Distinct().ToList();
        var claimTitles = claimIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _context.Claims.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(c => claimIds.Contains(c.Id))
                .Select(c => new { c.Id, c.Title, c.LotNumber })
                .ToDictionaryAsync(c => c.Id, c => string.IsNullOrWhiteSpace(c.Title) ? c.LotNumber : c.Title);

        var byPlan = new Dictionary<Guid, List<SteeringActionDto>>();
        foreach (var action in actions)
        {
            if (!byPlan.TryGetValue(action.ActionPlanId, out var list))
            {
                list = [];
                byPlan[action.ActionPlanId] = list;
            }
            list.Add(action);
        }

        foreach (var plan in plans)
        {
            if (plan.ClaimId is Guid claimId && claimTitles.TryGetValue(claimId, out var title))
                plan.ClaimTitle = title;
            if (byPlan.TryGetValue(plan.Id, out var list))
                plan.PlanActions = list;
        }

        return plans;
    }

    public async Task<HashSet<Guid>> GetVisibleIdsAsync(string userId, bool superAdmin)
    {
        var uid = (userId ?? string.Empty).Trim().ToLowerInvariant();
        var profile = await _context.UserProfiles.AsNoTracking()
            .Include(p => p.Department)
            .FirstOrDefaultAsync(p => p.UserId.ToLower() == uid);

        var plans = _context.ActionPlans.AsNoTracking().IgnoreQueryFilters();

        if (superAdmin)
        {
            // the platform superadmin sees every organization, whichever one their own account belongs to;
            // narrowing to some organizations is the job of the organization selector (organizationIds)
            return (await plans.Select(p => p.Id).ToListAsync()).ToHashSet();
        }

        var deptId = profile?.DepartmentId;
        var direct = await plans
            .Where(p =>
                (p.CreatedBy != null && p.CreatedBy.ToLower() == uid)
                || p.OwnerId.ToLower() == uid
                || (p.AssignedToId != null && p.AssignedToId.ToLower() == uid)
                || (deptId != null && p.DepartmentId == deptId))
            .Select(p => p.Id)
            .ToListAsync();

        var viaAssignment = await _context.UserActionPlanAssignments.AsNoTracking()
            .Where(a => a.UserId.ToLower() == uid)
            .Select(a => a.ActionPlanId)
            .ToListAsync();

        var viaActions = await _context.PlanActions.AsNoTracking()
            .IgnoreQueryFilters()
            .Where(a => !a.IsArchived && a.AssignedToId != null && a.AssignedToId.ToLower() == uid)
            .Select(a => a.ActionPlanId)
            .Distinct()
            .ToListAsync();

        return direct.Concat(viaAssignment).Concat(viaActions).ToHashSet();
    }

    private async Task HealOrphansThrottledAsync()
    {
        if (DateTime.UtcNow - _lastOrphanHealUtc < TimeSpan.FromMinutes(10))
            return;

        await _orphanHealLock.WaitAsync();
        try
        {
            if (DateTime.UtcNow - _lastOrphanHealUtc < TimeSpan.FromMinutes(10))
                return;

            try { await CloseOrphanPlansForClosedClaimsAsync("system"); }
            catch { /* best-effort consistency */ }

            _lastOrphanHealUtc = DateTime.UtcNow;
        }
        finally
        {
            _orphanHealLock.Release();
        }
    }

    public async Task<ActionPlanDto?> GetByIdAsync(Guid id)
    {
        var plan = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"ActionPlan {id} not found");
        return _mapper.Map<ActionPlanDto>(plan);
    }

    /// <summary>The domain of a plan: the one asked for if it is an active entry of the "domain" list, else the fallback (a domain that is not in the list is refused).</summary>
    private async Task<string> ResolveDomainAsync(string? requested, string fallback)
    {
        var code = (requested ?? string.Empty).Trim();
        if (code.Length == 0) return fallback;
        var active = await _context.ReferenceItems.AsNoTracking()
            .Where(r => r.ListKey == ReferenceListKeys.Domain && r.IsActive && r.MergedInto == null)
            .Select(r => r.Value).ToListAsync();
        // an installation that has not got the list yet (or switched everything off) is not blocked: the standard codes stay valid
        var allowed = active.Count > 0 ? active : CoreEntities.ActionPlanDomains.Standard.Select(d => d.Code).ToList();
        var match = allowed.FirstOrDefault(a => string.Equals(a.Trim(), code, StringComparison.OrdinalIgnoreCase));
        return match?.Trim() ?? throw new FluentValidation.ValidationException(new[] { new FluentValidation.Results.ValidationFailure("domain", $"Domaine inconnu : « {code} ». Choisissez un domaine de la liste de référence.") });
    }

    public async Task<ActionPlanDto> CreateAsync(CreateActionPlanDto dto, string createdBy)
    {
        var plan = _mapper.Map<CoreEntities.ActionPlan>(dto);
        plan.Domain = await ResolveDomainAsync(dto.Domain, CoreEntities.ActionPlanDomains.Default);
        // a client that sends only the department (the admin creation page) gets the organization of that department
        if (plan.OrganizationId == Guid.Empty)
            plan.OrganizationId = await _context.Departments.AsNoTracking().Where(d => d.Id == dto.DepartmentId).Select(d => d.OrganizationId).FirstOrDefaultAsync();
        plan.CreatedBy = createdBy;
        plan.OwnerId = createdBy;
        plan.Status = ActionPlanStatus.Created;
        if (dto.ClaimId.HasValue)
            plan.ClaimId = dto.ClaimId;

        if (dto.PlanActions != null)
        {
            foreach (var paDto in dto.PlanActions)
                plan.PlanActions.Add(_mapper.Map<PlanAction>(paDto));
        }

        if (dto.AlertId.HasValue)
            plan.AlertId = dto.AlertId;

        await _repo.AddAsync(plan);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = plan.Id,
            ChangedBy = createdBy,
            ActionType = "created",
            Note = $"Plan '{plan.Title}' créé"
        });

        // Auto-assign when creator (or admin) provides AssignedToId — required for employee self-service.
        if (!string.IsNullOrWhiteSpace(dto.AssignedToId))
        {
            plan.AssignedToId = dto.AssignedToId.Trim();
            if (plan.Status == ActionPlanStatus.Created)
                plan.Status = ActionPlanStatus.Ongoing;
            plan.UpdatedAt = DateTime.UtcNow;
            plan.UpdatedBy = createdBy;
            await _repo.UpdateAsync(plan);

            var existing = await _repo.GetAssignmentAsync(plan.AssignedToId, plan.Id);
            if (existing == null)
            {
                await _repo.AddAssignmentAsync(new CoreEntities.UserActionPlanAssignment
                {
                    Id = Guid.NewGuid(),
                    UserId = plan.AssignedToId,
                    ActionPlanId = plan.Id,
                    CanView = true,
                    CanEdit = true,
                    CreatedAt = DateTime.UtcNow
                });
            }

            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = plan.Id,
                ChangedBy = createdBy,
                ActionType = "assigned",
                NewAssignedToId = plan.AssignedToId,
                Note = $"Plan auto-assigné à {plan.AssignedToId}"
            });

            try
            {
                await _timelineService.AutoLogPlanAssignedAsync(plan.AssignedToId, plan.Id, plan.Title);
            }
            catch
            {
                /* non-bloquant */
            }
        }

        if (plan.AlertId.HasValue)
            await _alertHistory.LinkCapaAsync(plan.AlertId.Value, plan.Id, createdBy, null);

        try { await _semanticSearch.UpsertActionPlanAsync(plan); }
        catch { /* embedding is best-effort */ }

        return _mapper.Map<ActionPlanDto>(plan);
    }

    public async Task WarnAsync(Guid planId, string toUserId, string message, string sentBy)
    {
        var plan = await _repo.GetWithActionsAsync(planId)
            ?? throw new KeyNotFoundException($"ActionPlan {planId} not found");

        await _notificationService.NotifyAsync(
            toUserId,
            "plan_warning",
            $"Avertissement : {plan.Title}",
            message,
            plan.Id);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = planId,
            ChangedBy = sentBy,
            ActionType = "warning_sent",
            NewAssignedToId = toUserId,
            Note = message
        });
    }

    public async Task<ActionPlanDto> UpdateAsync(Guid id, UpdateActionPlanDto dto, string updatedBy)
    {
        var plan = await _repo.GetWithActionsAsync(id)
            ?? throw new KeyNotFoundException($"ActionPlan {id} not found");

        var oldStatus = plan.Status;
        var oldAssignedToId = plan.AssignedToId;
        var oldTitle = plan.Title;
        var oldDescription = plan.Description;
        var oldDeadline = plan.Deadline;
        var oldDepartmentId = plan.DepartmentId;
        var oldType = plan.Type;
        var oldOrganizationId = plan.OrganizationId;
        var oldDomain = plan.Domain;
        var hadAssignedUser = !string.IsNullOrEmpty(plan.AssignedToId);

        _mapper.Map(dto, plan);
        plan.Domain = await ResolveDomainAsync(dto.Domain, oldDomain);
        plan.UpdatedBy = updatedBy;

        if (plan.Status == ActionPlanStatus.Created && !hadAssignedUser && !string.IsNullOrEmpty(plan.AssignedToId))
            plan.Status = ActionPlanStatus.Ongoing;
        if (plan.Status == ActionPlanStatus.Ongoing && hadAssignedUser && string.IsNullOrEmpty(plan.AssignedToId))
            plan.Status = ActionPlanStatus.Created;

        CompletionTracking.ApplyActionPlanCompletion(plan, oldStatus);

        await _repo.UpdateAsync(plan);

        if (oldStatus != plan.Status)
        {
            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = id,
                ChangedBy = updatedBy,
                ActionType = "status_changed",
                OldStatus = oldStatus,
                NewStatus = plan.Status,
                Note = $"Statut changé de {oldStatus} à {plan.Status}"
            });

            if (plan.Status == ActionPlanStatus.Closed && plan.AlertId.HasValue)
            {
                await _alertHistory.RecordLinkedCapaChangeAsync(
                    plan.AlertId.Value,
                    plan.Id,
                    "monitoring_outcome",
                    "Suivi",
                    $"CAPA « {plan.Title} » clôturé.",
                    updatedBy,
                    null);
            }

            if (plan.Status == ActionPlanStatus.Closed && oldStatus != ActionPlanStatus.Closed)
            {
                try
                {
                    await _events.PublishAsync(new ActionPlanCompletedEvent(
                        plan.Id,
                        plan.AlertId,
                        plan.ClaimId,
                        plan.Title,
                        plan.AssignedToId,
                        plan.OwnerId,
                        plan.CompletedAt,
                        plan.IsOnTime,
                        updatedBy,
                        DateTime.UtcNow));
                }
                catch { /* domain events best-effort */ }
            }
        }

        if (oldAssignedToId != plan.AssignedToId)
        {
            var actionType = string.IsNullOrEmpty(oldAssignedToId) ? "assigned" :
                             string.IsNullOrEmpty(plan.AssignedToId) ? "unassigned" : "reassigned";

            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = id,
                ChangedBy = updatedBy,
                ActionType = actionType,
                OldAssignedToId = oldAssignedToId,
                NewAssignedToId = plan.AssignedToId,
                Note = "Assignation modifiée"
            });
        }

        var fieldChanges = new List<string>();
        if (oldTitle != plan.Title) fieldChanges.Add($"Titre: '{oldTitle}' → '{plan.Title}'");
        if (oldDescription != plan.Description) fieldChanges.Add("Description modifiée");
        if (oldDeadline != plan.Deadline) fieldChanges.Add($"Date limite: {oldDeadline:dd/MM/yyyy} → {plan.Deadline:dd/MM/yyyy}");
        if (oldDepartmentId != plan.DepartmentId) fieldChanges.Add("Département modifié");
        if (oldType != plan.Type) fieldChanges.Add($"Type: {oldType} → {plan.Type}");
        if (oldOrganizationId != plan.OrganizationId) fieldChanges.Add("Organisation modifiée");
        if (!string.Equals(oldDomain, plan.Domain, StringComparison.Ordinal)) fieldChanges.Add($"Domaine: {oldDomain} → {plan.Domain}");

        if (fieldChanges.Any())
        {
            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = id,
                ChangedBy = updatedBy,
                ActionType = "fields_updated",
                Note = string.Join(" | ", fieldChanges)
            });
        }

        if (oldStatus != plan.Status || oldAssignedToId != plan.AssignedToId)
        {
            var recipients = new List<string>();
            if (!string.IsNullOrWhiteSpace(oldAssignedToId)) recipients.Add(oldAssignedToId);
            if (!string.IsNullOrWhiteSpace(plan.AssignedToId)) recipients.Add(plan.AssignedToId);
            if (!string.IsNullOrWhiteSpace(plan.OwnerId)) recipients.Add(plan.OwnerId);
            try
            {
                await _realtime.SendDossierStatusChangedAsync(
                    new DossierRealtimeEvent(
                        "capa",
                        plan.ClaimId,
                        plan.Id,
                        plan.Status.ToString(),
                        plan.Title,
                        plan.AssignedToId),
                    recipients,
                    includeAdmins: true);
            }
            catch
            {
                // Realtime is best-effort.
            }
        }

        try { await _semanticSearch.UpsertActionPlanAsync(plan); }
        catch { /* embedding is best-effort */ }

        return _mapper.Map<ActionPlanDto>(plan);
    }

    public async Task ArchiveAsync(Guid id, string archivedBy)
    {
        var link = await _context.ActionPlans
            .IgnoreQueryFilters()
            .Where(p => p.Id == id)
            .Select(p => new { p.AlertId, p.Title, p.IsArchived })
            .FirstOrDefaultAsync();

        await _repo.ArchiveAsync(id, archivedBy);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = id,
            ChangedBy = archivedBy,
            ActionType = "archived",
            Note = "Plan archivé"
        });
        await _context.SaveChangesAsync();

        if (link?.AlertId is Guid alertId && !link.IsArchived)
        {
            await _alertHistory.RecordLinkedCapaChangeAsync(
                alertId,
                id,
                "capa_archived",
                "CAPA archivée",
                link.Title,
                archivedBy,
                null);
        }
    }

    public async Task<IEnumerable<ActionPlanDto>> GetByDepartmentAsync(Guid departmentId)
    {
        var plans = await _repo.GetByDepartmentAsync(departmentId);
        return _mapper.Map<IEnumerable<ActionPlanDto>>(plans);
    }

    public async Task<IEnumerable<ActionPlanDto>> GetByOwnerAsync(string ownerId)
    {
        var plans = await _repo.GetByOwnerAsync(ownerId);
        return _mapper.Map<IEnumerable<ActionPlanDto>>(plans);
    }

    public async Task<bool> ExistsAsync(Guid id)
    {
        var plan = await _repo.GetByIdAsync(id);
        return plan != null && !plan.IsArchived;
    }

    public async Task<object> AssignToUserAsync(AssignActionPlanDto dto, string? assignedBy = null)
    {
        var userExists = await _userRepo.ExistsAsync(dto.UserId);
        if (!userExists)
            throw new KeyNotFoundException($"Utilisateur {dto.UserId} non trouvé.");

        var plan = await _repo.GetByIdAsync(Guid.Parse(dto.ActionPlanId));
        if (plan == null || plan.IsArchived)
            throw new KeyNotFoundException($"Plan d'action {dto.ActionPlanId} non trouvé.");

        var actor = string.IsNullOrWhiteSpace(assignedBy) ? "system" : assignedBy.Trim();

        var existing = await _repo.GetAssignmentAsync(dto.UserId, Guid.Parse(dto.ActionPlanId));
        if (existing != null)
        {
            existing.CanView = dto.Permissions.View;
            existing.CanEdit = dto.Permissions.Edit;
            if (string.IsNullOrWhiteSpace(existing.AssignedBy))
                existing.AssignedBy = actor;
           // existing.CanDelete = dto.Permissions.Delete;
            await _repo.UpdateAssignmentAsync(existing);

            return new { message = "Permissions mises à jour avec succès", assignmentId = existing.Id };
        }

        var oldStatus = plan.Status;

        if (plan.Status == ActionPlanStatus.Created)
        {
            plan.Status = ActionPlanStatus.Ongoing;
            plan.UpdatedBy = actor;
            plan.UpdatedAt = DateTime.UtcNow;
            await _repo.UpdateAsync(plan);

            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = plan.Id,
                ChangedBy = actor,
                ActionType = "status_changed",
                OldStatus = oldStatus,
                NewStatus = ActionPlanStatus.Ongoing,
                Note = "Statut auto-promu: Created → Ongoing (première assignation)"
            });
        }

        var assignment = new CoreEntities.UserActionPlanAssignment
        {
            Id = Guid.NewGuid(),
            UserId = dto.UserId,
            ActionPlanId = Guid.Parse(dto.ActionPlanId),
            CanView = dto.Permissions.View,
            CanEdit = dto.Permissions.Edit,
           // CanDelete = dto.Permissions.Delete,
            CreatedAt = DateTime.UtcNow,
            AssignedBy = actor
        };

        await _repo.AddAssignmentAsync(assignment);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = plan.Id,
            ChangedBy = actor,
            ActionType = "assigned",
            NewAssignedToId = dto.UserId,
            Note = $"Plan assigné à l'utilisateur {dto.UserId}"
        });

        // ── Auto-log timeline : plan assigné à l'employé ──────────────────
        await _timelineService.AutoLogPlanAssignedAsync(
            dto.UserId,
            plan.Id,
            plan.Title);

        return new { message = "Plan assigné avec succès", assignmentId = assignment.Id };
    }

    private static int ComputeProgress(CoreEntities.ActionPlan plan)
    {
        // Closed / archived CAPA are always complete by definition.
        if (plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived)
            return 100;

        return PlanProgress.FromActions(
            (plan.PlanActions ?? []).Where(a => !a.IsArchived).Select(a => a.Progress), plan.Progress);
    }

    public async Task<IEnumerable<AssignedActionPlanDto>> GetUserAssignedPlansAsync(string userId)
    {
        var uid = (userId ?? string.Empty).Trim();
        var assignments = (await _repo.GetUserAssignmentsAsync(uid)).ToList();
        var byId = new Dictionary<Guid, AssignedActionPlanDto>();

        foreach (var a in assignments)
        {
            if (a.ActionPlan == null || a.ActionPlan.IsArchived) continue;
            byId[a.ActionPlanId] = new AssignedActionPlanDto
            {
                Id = a.ActionPlanId.ToString(),
                Reference = a.ActionPlan.Reference,
                Title = a.ActionPlan.Title,
                Description = a.ActionPlan.Description,
                Type = (int)a.ActionPlan.Type,
                Domain = a.ActionPlan.Domain,
                DepartmentId = a.ActionPlan.DepartmentId,
                DepartmentName = null,
                Status = (int)a.ActionPlan.Status,
                Progress = ComputeProgress(a.ActionPlan),
                AssignedToId = a.UserId,
                CreatedAt = a.CreatedAt,
                Deadline = a.ActionPlan.Deadline,
                CompletedAt = a.ActionPlan.CompletedAt,
                IsOnTime = a.ActionPlan.IsOnTime,
                Permissions = new ActionPlanPermissions
                {
                    View = a.CanView,
                    Edit = a.CanEdit,
                },
                UpdatedBy = a.ActionPlan.UpdatedBy,
                AssignedBy = a.AssignedBy ?? a.ActionPlan.UpdatedBy,
                ClaimId = a.ActionPlan.ClaimId
            };
        }

        // Plans où l'utilisateur est propriétaire, créateur, assigné (plan ou sous-action).
        var relatedPlans = await _context.ActionPlans
            .Include(p => p.PlanActions)
            .Where(p => !p.IsArchived && (
                (p.OwnerId != null && p.OwnerId.ToLower() == uid.ToLower())
                || (p.CreatedBy != null && p.CreatedBy.ToLower() == uid.ToLower())
                || (p.AssignedToId != null && p.AssignedToId.ToLower() == uid.ToLower())
                || p.PlanActions.Any(pa =>
                    !pa.IsArchived
                    && pa.AssignedToId != null
                    && pa.AssignedToId.ToLower() == uid.ToLower())
            ))
            .ToListAsync();

        foreach (var plan in relatedPlans)
        {
            if (byId.ContainsKey(plan.Id)) continue;
            byId[plan.Id] = new AssignedActionPlanDto
            {
                Id = plan.Id.ToString(),
                Reference = plan.Reference,
                Title = plan.Title,
                Description = plan.Description,
                Type = (int)plan.Type,
                Domain = plan.Domain,
                DepartmentId = plan.DepartmentId,
                DepartmentName = null,
                Status = (int)plan.Status,
                Progress = ComputeProgress(plan),
                AssignedToId = plan.AssignedToId ?? uid,
                CreatedAt = plan.CreatedAt,
                Deadline = plan.Deadline,
                CompletedAt = plan.CompletedAt,
                IsOnTime = plan.IsOnTime,
                Permissions = new ActionPlanPermissions
                {
                    View = true,
                    Edit = true,
                },
                UpdatedBy = plan.UpdatedBy,
                AssignedBy = plan.UpdatedBy ?? plan.CreatedBy,
                ClaimId = plan.ClaimId
            };
        }

        await FillDepartmentNamesAsync(byId.Values);
        return byId.Values.OrderByDescending(p => p.CreatedAt);
    }

    public async Task<AssignedActionPlanDto?> GetAssignedPlanByIdAsync(Guid planId, string userId)
    {
        var uid = (userId ?? string.Empty).Trim();
        var assignment = await _repo.GetAssignmentAsync(uid, planId);
        var plan = await _repo.GetWithActionsAsync(planId);
        if (plan == null || plan.IsArchived) return null;

        var hasAssignment = assignment != null && assignment.CanView;
        var isOwner = (!string.IsNullOrWhiteSpace(plan.OwnerId)
                && string.Equals(plan.OwnerId, uid, StringComparison.OrdinalIgnoreCase))
            || (!string.IsNullOrWhiteSpace(plan.CreatedBy)
                && string.Equals(plan.CreatedBy, uid, StringComparison.OrdinalIgnoreCase));
        var isDirectAssignee = !string.IsNullOrWhiteSpace(plan.AssignedToId)
            && string.Equals(plan.AssignedToId, uid, StringComparison.OrdinalIgnoreCase);
        var hasAction = plan.PlanActions?.Any(pa =>
            !pa.IsArchived
            && !string.IsNullOrWhiteSpace(pa.AssignedToId)
            && string.Equals(pa.AssignedToId, uid, StringComparison.OrdinalIgnoreCase)) == true;

        if (!hasAssignment && !isOwner && !isDirectAssignee && !hasAction)
            return null;

        var assigned = new AssignedActionPlanDto
        {
            Id = plan.Id.ToString(),
            Reference = plan.Reference,
            Title = plan.Title,
            Description = plan.Description,
            Type = (int)plan.Type,
            Domain = plan.Domain,
            DepartmentId = plan.DepartmentId,
            DepartmentName = null,
            Status = (int)plan.Status,
            Progress = ComputeProgress(plan),
            AssignedToId = assignment?.UserId ?? plan.AssignedToId ?? uid,
            CreatedAt = assignment?.CreatedAt ?? plan.CreatedAt,
            Deadline = plan.Deadline,
            CompletedAt = plan.CompletedAt,
            IsOnTime = plan.IsOnTime,
            Permissions = new ActionPlanPermissions
            {
                View = true,
                Edit = assignment?.CanEdit ?? true,
            },
            UpdatedBy = plan.UpdatedBy,
            AssignedBy = assignment?.AssignedBy ?? plan.UpdatedBy,
            ClaimId = plan.ClaimId
        };
        await FillDepartmentNamesAsync(new[] { assigned });
        return assigned;
    }

    /// <summary>The department name of each plan, looked up apart (a join would drop a plan whose department is missing).</summary>
    private async Task FillDepartmentNamesAsync(IEnumerable<AssignedActionPlanDto> plans)
    {
        var list = plans.ToList();
        var ids = list.Select(p => p.DepartmentId).Where(i => i != Guid.Empty).Distinct().ToList();
        if (ids.Count == 0) return;
        var names = await _context.Departments.AsNoTracking().IgnoreQueryFilters().Where(d => ids.Contains(d.Id)).ToDictionaryAsync(d => d.Id, d => d.Name);
        foreach (var p in list) p.DepartmentName = names.GetValueOrDefault(p.DepartmentId);
    }

    public async Task<bool> UpdateAssignedPermissionsAsync(Guid assignmentId, UpdatePermissionsDto dto)
    {
        var assignment = await _repo.GetAssignmentByIdAsync(assignmentId);
        if (assignment == null) return false;

        assignment.CanView = dto.CanView;
        assignment.CanEdit = dto.CanEdit;
       // assignment.CanDelete = dto.CanDelete;

        await _repo.UpdateAssignmentAsync(assignment);
        return true;
    }

    public async Task<bool> UnassignFromUserAsync(Guid userId, Guid actionPlanId)
    {
        var assignment = await _repo.GetAssignmentAsync(userId.ToString(), actionPlanId);
        if (assignment == null) return false;

        await _repo.RemoveAssignmentAsync(assignment);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = actionPlanId,
            ChangedBy = userId.ToString(),
            ActionType = "unassigned",
            OldAssignedToId = userId.ToString(),
            Note = $"Assignation retirée pour l'utilisateur {userId}"
        });

        return true;
    }

    public async Task<IEnumerable<AssignedActionPlanDto>> GetAllAssignmentsAsync()
    {
        var assignments = await _repo.GetAllAssignmentsAsync();
        return assignments.Select(a => new AssignedActionPlanDto
        {
            Id = a.ActionPlanId.ToString(),
            Reference = a.ActionPlan.Reference,
            Title = a.ActionPlan.Title,
            Description = a.ActionPlan.Description,
            Domain = a.ActionPlan.Domain,
            DepartmentId = a.ActionPlan.DepartmentId,
            DepartmentName = null,
            Status = (int)a.ActionPlan.Status,
            Progress = ComputeProgress(a.ActionPlan),
            AssignedToId = a.UserId,
            CreatedAt = a.CreatedAt,
            Deadline = a.ActionPlan.Deadline,
            CompletedAt = a.ActionPlan.CompletedAt,
            IsOnTime = a.ActionPlan.IsOnTime,
            Permissions = new ActionPlanPermissions
            {
                View = a.CanView,
                Edit = a.CanEdit,
               // Delete = a.CanDelete
            },
            UpdatedBy = a.ActionPlan.UpdatedBy,
            AssignedBy = a.AssignedBy ?? a.ActionPlan.UpdatedBy,
            ClaimId = a.ActionPlan.ClaimId
        });
    }

    public async Task<bool> CloseEmptyAssignedPlanAsync(Guid planId, string userId)
    {
        var plan = await _repo.GetWithActionsAsync(planId)
            ?? throw new KeyNotFoundException($"ActionPlan {planId} not found");

        if (!await CanEmployeeEditPlanAsync(plan, userId))
            throw new UnauthorizedAccessException("Vous n'avez pas la permission de modifier ce plan.");

        if (plan.IsArchived)
            throw new InvalidOperationException("Ce plan est archivé.");

        var activeActions = plan.PlanActions?.Where(a => !a.IsArchived).ToList() ?? new List<PlanAction>();
        if (activeActions.Any())
            throw new InvalidOperationException("Ce plan contient des sous-actions : utilisez la mise à jour de progression habituelle.");

        var oldProgress = plan.Progress;
        plan.Progress = 100;
        plan.UpdatedBy = userId;
        plan.UpdatedAt = DateTime.UtcNow;

        await _repo.UpdateAsync(plan);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = planId,
            ChangedBy = userId,
            ActionType = "marked_completed",
            Note = $"Plan marqué comme terminé par l'employé ({oldProgress}% → 100%) — en attente de validation admin"
        });

        // ── Auto-log timeline : plan complété par l'employé ───────────────
        await _timelineService.AutoLogPlanCompletedAsync(
            userId,
            planId,
            plan.Title);

        var adminIds = await _userRepo.GetUserIdsByRoleAsync("admin");
        var superadminIds = await _userRepo.GetUserIdsByRoleAsync("superadmin");

        foreach (var adminId in adminIds.Concat(superadminIds).Distinct())
        {
            await _notificationService.NotifyAsync(
                adminId,
                "plan_ready_for_validation",
                "Plan à valider",
                $"Le plan « {plan.Title} » est terminé et attend votre validation.",
                planId);
        }

        return true;
    }

    public async Task UpdateAssignedPlanProgressAsync(Guid planId, string userId, int progress)
    {
        var plan = await _repo.GetWithActionsAsync(planId)
            ?? throw new KeyNotFoundException();

        if (!await CanEmployeeEditPlanAsync(plan, userId))
            throw new UnauthorizedAccessException("Vous n'avez pas la permission de modifier ce plan.");

        if (progress < 0 || progress > 100)
            throw new InvalidOperationException("La progression doit être entre 0 et 100.");

        var oldProgress = plan.Progress;
        var oldStatus = plan.Status;

        var activeActions = plan.PlanActions?.Where(a => !a.IsArchived).ToList() ?? new();
        if (activeActions.Any())
            throw new InvalidOperationException(
                "Ce plan a des sous-actions : mettez à jour la progression de chaque sous-action.");

        plan.Progress = progress;
        plan.UpdatedBy = userId;
        plan.UpdatedAt = DateTime.UtcNow;

        if (plan.Status == ActionPlanStatus.Created || plan.Status == ActionPlanStatus.Ongoing)
            plan.Status = ActionPlanStatus.Ongoing;

        await _repo.UpdateAsync(plan);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = planId,
            ChangedBy = userId,
            ActionType = "progress_updated",
            Note = $"Progression mise à jour: {oldProgress}% → {progress}%"
        });

        if (progress == 100)
        {
            // ── Auto-log timeline : plan complété via progression directe ─
            await _timelineService.AutoLogPlanCompletedAsync(
                userId,
                planId,
                plan.Title);

            var adminIds = await _userRepo.GetUserIdsByRoleAsync("admin");
            var superadminIds = await _userRepo.GetUserIdsByRoleAsync("superadmin");

            foreach (var adminId in adminIds.Concat(superadminIds).Distinct())
            {
                await _notificationService.NotifyAsync(
                    adminId,
                    "plan_ready_for_validation",
                    "Plan à valider",
                    $"Le plan « {plan.Title} » est terminé et attend votre validation.",
                    planId);
            }
        }

        if (oldStatus != plan.Status)
        {
            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = planId,
                ChangedBy = userId,
                ActionType = "status_changed",
                OldStatus = oldStatus,
                NewStatus = plan.Status,
                Note = "Statut auto-promu: Created → Ongoing"
            });
        }
    }

    /// <summary>
    /// Autorise l'édition si l'utilisateur a une assignation CanEdit,
    /// ou s'il est assigné / propriétaire du plan (cas fréquent des plans de référence
    /// sans ligne UserActionPlanAssignments).
    /// </summary>
    private async Task<bool> CanEmployeeEditPlanAsync(CoreEntities.ActionPlan plan, string userId)
    {
        var uid = (userId ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(uid)) return false;

        var assignment = await _repo.GetAssignmentAsync(uid, plan.Id);
        if (assignment != null)
            return assignment.CanEdit;

        if (!string.IsNullOrWhiteSpace(plan.AssignedToId)
            && string.Equals(plan.AssignedToId, uid, StringComparison.OrdinalIgnoreCase))
            return true;

        if (!string.IsNullOrWhiteSpace(plan.OwnerId)
            && string.Equals(plan.OwnerId, uid, StringComparison.OrdinalIgnoreCase))
            return true;

        // Certains plans stockent l'id Identity dans CreatedBy
        if (!string.IsNullOrWhiteSpace(plan.CreatedBy)
            && string.Equals(plan.CreatedBy, uid, StringComparison.OrdinalIgnoreCase))
            return true;

        var hasAction = plan.PlanActions?.Any(pa =>
            !pa.IsArchived
            && !string.IsNullOrWhiteSpace(pa.AssignedToId)
            && string.Equals(pa.AssignedToId, uid, StringComparison.OrdinalIgnoreCase)) == true;
        return hasAction;
    }

    public async Task<IEnumerable<ActionPlanHistoryDto>> GetAllHistoryAsync(Guid? planId = null)
    {
        var history = await _context.ActionPlanHistories
            .IgnoreQueryFilters()
            .Include(h => h.ActionPlan).ThenInclude(p => p.Department)
            .Where(h => planId == null || h.ActionPlanId == planId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();

        // sub-actions: progress, completion, validation, rejection and warnings (kept in their own history)
        var subHistory = await _context.PlanActionHistories
            .IgnoreQueryFilters()
            .Include(h => h.PlanAction).ThenInclude(a => a.ActionPlan).ThenInclude(p => p.Department)
            .Where(h => h.PlanAction != null && h.PlanAction.ActionPlan != null)
            .Where(h => planId == null || h.PlanAction.ActionPlanId == planId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();

        var userIds = history
            .SelectMany(h => new[] { h.ChangedBy, h.NewAssignedToId, h.OldAssignedToId })
            .Concat(subHistory.Select(h => h.ChangedBy))
            .OfType<string>()
            .Where(id => id.Length > 0)
            .Distinct()
            .ToList();
        var aliases = await _context.UserAliases.AsNoTracking().ToDictionaryAsync(a => a.OldUserId, a => a.UserId, StringComparer.OrdinalIgnoreCase);
        var userNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var uid in userIds)
        {
            // a merged account shows the name of the account that replaced it
            var name = await _userRepo.GetUserNameByIdAsync(aliases.TryGetValue(uid, out var current) ? current : uid);
            if (name != null) userNames[uid] = name;
        }

        var planItems = history.Select(h => new ActionPlanHistoryDto
        {
            Id = h.Id.ToString(),
            ActionPlanId = h.ActionPlanId.ToString(),
            DepartmentId = h.ActionPlan?.DepartmentId.ToString(),
            DepartmentName = h.ActionPlan?.Department?.Name,
            ActionPlan = h.ActionPlan == null ? null : new ActionPlanRefDto { Title = h.ActionPlan.Title },
            ChangedBy = h.ChangedBy,
            ChangedByName = ResolveDisplayName(h.ChangedByName, h.ChangedBy, userNames),
            ActionType = h.ActionType,
            OldStatus = h.OldStatus.HasValue ? (int?)h.OldStatus.Value : null,
            NewStatus = h.NewStatus.HasValue ? (int?)h.NewStatus.Value : null,
            OldAssignedToId = h.OldAssignedToId,
            NewAssignedToId = h.NewAssignedToId,
            OldAssignedToName = ResolveDisplayName(h.OldAssignedToName, h.OldAssignedToId, userNames),
            NewAssignedToName = ResolveDisplayName(h.NewAssignedToName, h.NewAssignedToId, userNames),
            Note = h.Note,
            CreatedAt = h.CreatedAt
        });

        var subItems = subHistory.Select(h =>
        {
            var plan = h.PlanAction.ActionPlan;
            var kind = SubActionEventType(h);
            var detail = string.IsNullOrWhiteSpace(h.Note)
                ? $"{(int)DisplayProgress(h.OldProgress)} % → {(int)DisplayProgress(h.NewProgress)} %"
                : h.Note!.Trim();
            return new ActionPlanHistoryDto
            {
                Id = $"sub-{h.Id}",
                ActionPlanId = plan.Id.ToString(),
                DepartmentId = plan.DepartmentId.ToString(),
                DepartmentName = plan.Department?.Name,
                ActionPlan = new ActionPlanRefDto { Title = plan.Title },
                ChangedBy = h.ChangedBy,
                ChangedByName = ResolveDisplayName(null, h.ChangedBy, userNames),
                ActionType = kind,
                Note = $"« {h.PlanAction.Title} » · {detail}",
                CreatedAt = h.CreatedAt,
            };
        });

        return planItems.Concat(subItems).OrderByDescending(i => i.CreatedAt).ToList();
    }

    /// <summary>The kind of a sub-action history row: validated, rejected, warning, completed or plain progress.</summary>
    private static string SubActionEventType(PlanActionHistory h)
    {
        var note = (h.Note ?? string.Empty).TrimStart();
        if (h.NewProgress == ActionProgress.Validated) return "subaction_validated";
        if (h.NewProgress == ActionProgress.SeventyFive && h.OldProgress == ActionProgress.Hundred
            && note.StartsWith("Rejet", StringComparison.OrdinalIgnoreCase)) return "subaction_rejected";
        if (h.OldProgress == h.NewProgress && note.StartsWith("Avertissement", StringComparison.OrdinalIgnoreCase)) return "subaction_warning";
        if (h.OldProgress == h.NewProgress && note.StartsWith("Preuve", StringComparison.OrdinalIgnoreCase)) return "subaction_proof";
        if (h.NewProgress == ActionProgress.Hundred) return "subaction_completed";
        return "subaction_progress";
    }

    private static ActionProgress DisplayProgress(ActionProgress p) =>
        p == ActionProgress.Validated ? ActionProgress.Hundred : p == ActionProgress.Cancelled ? ActionProgress.NotStarted : p;

    /// <summary>The person's current name when the id is known, else the text stored with the record.</summary>
    private static string? ResolveDisplayName(string? storedName, string? userId, Dictionary<string, string> userNames)
    {
        if (!string.IsNullOrEmpty(userId) && userNames.TryGetValue(userId, out var resolved))
            return resolved;
        return storedName;
    }

    public async Task<IEnumerable<ActionPlanHistory>> GetPlanHistoryAsync(Guid actionPlanId)
    {
        return await _context.ActionPlanHistories
            .Where(h => h.ActionPlanId == actionPlanId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();
    }

    public async Task RestoreAsync(Guid id, string restoredBy)
    {
        var plan = await _context.ActionPlans
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Id == id)
            ?? throw new KeyNotFoundException($"ActionPlan {id} not found");

        plan.IsArchived = false;
        plan.ArchivedAt = null;
        plan.ArchivedBy = null;
        plan.Status = ActionPlanStatus.Ongoing;
        plan.UpdatedBy = restoredBy;
        plan.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = id,
            ChangedBy = restoredBy,
            ActionType = "restored",
            Note = "Plan restauré"
        });
    }

    public async Task<IEnumerable<ActionPlanDto>> GetPendingValidationAsync()
    {
        var plans = await _context.ActionPlans
            .Where(p => p.Progress == 100 && p.Status == ActionPlanStatus.Ongoing && !p.IsArchived)
            .ToListAsync();
        var dtos = _mapper.Map<List<ActionPlanDto>>(plans);
        await FillValidationInfoAsync(dtos);
        return dtos;
    }

    private const string RejectedHistoryType = "rejected";

    /// <summary>Progress a rejected plan returns to: below 100 so it leaves the validation queue until resubmitted.</summary>
    private const int ProgressAfterRejection = 90;

    public async Task RejectAsync(Guid planId, string adminId, string comment)
    {
        var plan = await _context.ActionPlans.FirstOrDefaultAsync(p => p.Id == planId)
            ?? throw new KeyNotFoundException($"ActionPlan {planId} not found");

        if (plan.IsArchived || plan.Status != ActionPlanStatus.Ongoing || plan.Progress < 100)
            throw new InvalidOperationException("Seul un plan en attente de validation peut être renvoyé.");

        var oldProgress = plan.Progress;
        plan.Progress = ProgressAfterRejection;
        plan.UpdatedBy = adminId;
        plan.UpdatedAt = DateTime.UtcNow;

        _context.ActionPlanHistories.Add(new ActionPlanHistory
        {
            ActionPlanId = planId,
            ChangedBy = adminId,
            ActionType = RejectedHistoryType,
            Note = comment,
            ChangesJson = $"{{\"progress\":{{\"old\":{oldProgress},\"new\":{ProgressAfterRejection}}}}}",
        });
        await _context.SaveChangesAsync();

        // Assignee first, then whoever owns the plan.
        var recipient = new[] { plan.AssignedToId, plan.OwnerId, plan.CreatedBy }
            .FirstOrDefault(id => !string.IsNullOrWhiteSpace(id) && !string.Equals(id, adminId, StringComparison.OrdinalIgnoreCase));
        if (recipient != null)
        {
            await _notificationService.NotifyAsync(
                recipient,
                "plan_rejected",
                "Plan renvoyé",
                $"Votre plan « {plan.Title} » a été renvoyé pour correction : {comment}",
                planId,
                $"/pages/front/my-action-plans/{planId}");
        }
    }

    public async Task<IEnumerable<ActionPlanDto>> GetRejectedAsync(string userId, bool qualityAdmin, bool superAdmin)
    {
        HashSet<Guid> scope;
        if (qualityAdmin)
        {
            scope = await GetVisibleIdsAsync(userId, superAdmin);
        }
        else
        {
            var mine = await GetUserAssignedPlansAsync(userId);
            scope = mine.Select(p => Guid.TryParse(p.Id, out var id) ? id : Guid.Empty)
                .Where(id => id != Guid.Empty)
                .ToHashSet();
        }
        if (scope.Count == 0)
            return Array.Empty<ActionPlanDto>();

        // Rejected = sent back at least once and not resubmitted yet (resubmitting puts progress back to 100).
        var plans = await _context.ActionPlans
            .AsNoTracking()
            .Where(p => scope.Contains(p.Id)
                        && !p.IsArchived
                        && p.Status == ActionPlanStatus.Ongoing
                        && p.Progress < 100
                        && _context.ActionPlanHistories.Any(h => h.ActionPlanId == p.Id && h.ActionType == RejectedHistoryType))
            .ToListAsync();

        var dtos = _mapper.Map<List<ActionPlanDto>>(plans);
        await FillValidationInfoAsync(dtos);
        return dtos.OrderByDescending(d => d.LastRejectedAt);
    }

    public async Task ResubmitAsync(Guid planId, string userId)
    {
        var plan = await _repo.GetWithActionsAsync(planId)
            ?? throw new KeyNotFoundException($"ActionPlan {planId} not found");

        if (!await CanEmployeeEditPlanAsync(plan, userId))
            throw new UnauthorizedAccessException("Vous n'avez pas la permission de modifier ce plan.");

        var wasRejected = await _context.ActionPlanHistories
            .AnyAsync(h => h.ActionPlanId == planId && h.ActionType == RejectedHistoryType);
        if (plan.IsArchived || plan.Status != ActionPlanStatus.Ongoing || plan.Progress >= 100 || !wasRejected)
            throw new InvalidOperationException("Seul un plan renvoyé peut être soumis à nouveau.");

        var activeActions = plan.PlanActions?.Where(a => !a.IsArchived).ToList() ?? new List<PlanAction>();
        if (activeActions.Any(a => a.Progress is not (ActionProgress.Hundred or ActionProgress.Validated)))
            throw new InvalidOperationException("Toutes les sous-actions doivent être terminées avant de renvoyer le plan.");

        var oldProgress = plan.Progress;
        plan.Progress = 100;
        plan.UpdatedBy = userId;
        plan.UpdatedAt = DateTime.UtcNow;
        await _repo.UpdateAsync(plan);

        await _historyRepo.AddAsync(new ActionPlanHistory
        {
            ActionPlanId = planId,
            ChangedBy = userId,
            ActionType = "resubmitted",
            Note = $"Plan corrigé et renvoyé en validation ({oldProgress}% → 100%)",
        });

        await _notificationService.NotifyAdminsAsync(
            "plan_ready_for_validation",
            "Plan corrigé à valider",
            $"Le plan « {plan.Title} » a été corrigé et attend à nouveau votre validation.",
            planId,
            linkPath: "/admin/validations?tab=capa",
            excludeUserId: userId);
    }

    /// <summary>Evidence count and latest rejection, for the validation hub and the employee dashboard.</summary>
    private async Task FillValidationInfoAsync(List<ActionPlanDto> dtos)
    {
        if (dtos.Count == 0) return;
        var ids = dtos.Select(d => d.Id).ToList();

        var proofs = await _context.ActionDocuments
            .AsNoTracking()
            .Where(d => ids.Contains(d.PlanAction.ActionPlanId))
            .GroupBy(d => d.PlanAction.ActionPlanId)
            .Select(g => new { PlanId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.PlanId, x => x.Count);

        var rejections = (await _context.ActionPlanHistories
                .AsNoTracking()
                .Where(h => ids.Contains(h.ActionPlanId) && h.ActionType == RejectedHistoryType)
                .Select(h => new { h.ActionPlanId, h.CreatedAt, h.Note })
                .ToListAsync())
            .GroupBy(h => h.ActionPlanId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(h => h.CreatedAt).First());

        foreach (var dto in dtos)
        {
            dto.ProofCount = proofs.GetValueOrDefault(dto.Id);
            if (rejections.TryGetValue(dto.Id, out var last))
            {
                dto.LastRejectedAt = last.CreatedAt;
                dto.LastRejectComment = last.Note;
            }
        }
    }

    public async Task<IEnumerable<ActionPlanDto>> GetByClaimIdAsync(Guid claimId)
    {
        var plans = await _context.ActionPlans
            .AsNoTracking()
            .Where(p => p.ClaimId == claimId && !p.IsArchived)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();
        return _mapper.Map<IEnumerable<ActionPlanDto>>(plans);
    }

    public async Task<int> CloseOpenPlansForClaimAsync(Guid claimId, string closedBy, string? note = null)
    {
        var plans = await _context.ActionPlans
            .AsNoTracking()
            .Where(p => p.ClaimId == claimId
                        && !p.IsArchived
                        && (p.Status == ActionPlanStatus.Created || p.Status == ActionPlanStatus.Ongoing))
            .ToListAsync();

        if (plans.Count == 0) return 0;

        var historyNote = string.IsNullOrWhiteSpace(note)
            ? "Clôturé suite à la clôture de la réclamation"
            : note.Trim();
        var closed = 0;

        foreach (var snapshot in plans)
        {
            await UpdateAsync(snapshot.Id, new UpdateActionPlanDto
            {
                Title = snapshot.Title,
                Description = snapshot.Description,
                Status = ActionPlanStatus.Closed,
                Type = snapshot.Type,
                OrganizationId = snapshot.OrganizationId,
                DepartmentId = snapshot.DepartmentId,
                AssignedToId = snapshot.AssignedToId,
                Deadline = snapshot.Deadline
            }, closedBy);

            // Override generic status_changed note with a clearer reason.
            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = snapshot.Id,
                ChangedBy = closedBy,
                ActionType = "status_changed",
                OldStatus = snapshot.Status,
                NewStatus = ActionPlanStatus.Closed,
                Note = historyNote
            });
            closed++;
        }

        return closed;
    }

    public async Task<int> CloseOrphanPlansForClosedClaimsAsync(string closedBy = "system")
    {
        var orphanIds = await (
            from p in _context.ActionPlans.AsNoTracking()
            join c in _context.Claims.AsNoTracking() on p.ClaimId equals c.Id
            where p.ClaimId != null
                  && !p.IsArchived
                  && (p.Status == ActionPlanStatus.Created || p.Status == ActionPlanStatus.Ongoing)
                  && (c.StatusCode == "CLOTUREE"
                      || c.StatusCode == "CLOSED"
                      || c.StatusCode == "CLOTURE"
                      || c.StatusCode == "CLOTURÉE")
            select p.Id
        ).ToListAsync();

        if (orphanIds.Count == 0) return 0;

        var closed = 0;
        foreach (var id in orphanIds)
        {
            var plan = await _context.ActionPlans.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
            if (plan == null) continue;
            if (plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived) continue;

            await UpdateAsync(id, new UpdateActionPlanDto
            {
                Title = plan.Title,
                Description = plan.Description,
                Status = ActionPlanStatus.Closed,
                Type = plan.Type,
                OrganizationId = plan.OrganizationId,
                DepartmentId = plan.DepartmentId,
                AssignedToId = plan.AssignedToId,
                Deadline = plan.Deadline
            }, closedBy);

            await _historyRepo.AddAsync(new ActionPlanHistory
            {
                ActionPlanId = id,
                ChangedBy = closedBy,
                ActionType = "status_changed",
                OldStatus = plan.Status,
                NewStatus = ActionPlanStatus.Closed,
                Note = "Clôturé automatiquement : réclamation déjà clôturée"
            });
            closed++;
        }

        return closed;
    }
}