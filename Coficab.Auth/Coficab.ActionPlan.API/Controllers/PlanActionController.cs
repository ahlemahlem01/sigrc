using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using System.Security.Claims;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PlanActionController : ControllerBase
{
    private readonly IPlanActionService _service;
    private readonly IActionPlanService _actionPlanService;
    private readonly Coficab.ActionPlan.Application.Interfaces.IApplicationDbContext _db;

    public PlanActionController(IPlanActionService service, IActionPlanService actionPlanService, Coficab.ActionPlan.Application.Interfaces.IApplicationDbContext db)
    {
        _service = service;
        _actionPlanService = actionPlanService;
        _db = db;
    }

    private string? CurrentUserId() =>
        User.FindFirst(OpenIddictConstants.Claims.Subject)?.Value
        ?? User.FindFirst("sub")?.Value
        ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private bool IsQualityAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        return roles.Contains("admin")
            || roles.Contains("superadmin")
            || roles.Contains("admin_quality");
    }

    private bool IsSuperAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        return roles.Contains("superadmin");
    }

    private async Task<bool> CanAccessPlanAsync(Guid actionPlanId, string userId)
    {
        if (IsQualityAdmin()) return true;
        var assigned = await _actionPlanService.GetAssignedPlanByIdAsync(actionPlanId, userId);
        return assigned != null;
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        var action = await _service.GetByIdAsync(id);
        if (action is null) return NotFound();

        if (!await CanAccessPlanAsync(action.ActionPlanId, userId))
            return Forbid();

        return Ok(action);
    }

    [HttpGet("by-plan/{actionPlanId}")]
    public async Task<IActionResult> GetByActionPlan(Guid actionPlanId, [FromServices] IApplicationDbContext db)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        if (!await CanAccessPlanAsync(actionPlanId, userId))
            return Forbid();

        var actions = (await _service.GetByActionPlanAsync(actionPlanId)).ToList();
        // the people's current names, a merged account showing the account that replaced it
        var profiles = await db.UserProfiles.AsNoTracking().ToListAsync(HttpContext.RequestAborted);
        var aliases = await Application.QualityAnalyses.Queries.Claims.ClaimVisibility.AliasesAsync(db, HttpContext.RequestAborted);
        foreach (var a in actions.Where(a => !string.IsNullOrWhiteSpace(a.AssignedToId)))
            a.AssignedToName = Application.QualityAnalyses.Queries.Claims.ClaimVisibility.PersonName(profiles, a.AssignedToId, null, aliases);

        var ids = actions.Select(a => a.Id).ToList();
        var proofs = await db.ActionDocuments.AsNoTracking().Where(d => ids.Contains(d.PlanActionId) && !d.IsArchived)
            .GroupBy(d => d.PlanActionId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, HttpContext.RequestAborted);
        foreach (var a in actions) a.DocumentCount = proofs.GetValueOrDefault(a.Id);
        return Ok(actions);
    }

    private const long MaxProofBytes = 10 * 1024 * 1024;

    /// <summary>Attaches a proof (photo, report, office file) to a sub-action. Whoever can work on the plan can add one; the file is private and only served by the download route.</summary>
    [HttpPost("{id:guid}/documents")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadProof(Guid id, IFormFile file, [FromServices] IWebHostEnvironment env, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });

        var action = await _db.PlanActions.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id && !a.IsArchived, ct);
        if (action is null) return NotFound();
        if (!await CanAccessPlanAsync(action.ActionPlanId, userId)) return Forbid();

        if (file is not { Length: > 0 }) return BadRequest(new { error = "Fichier requis." });
        if (file.Length > MaxProofBytes) return BadRequest(new { error = "Fichier trop volumineux (10 Mo maximum)." });
        if (!Services.DocumentStorage.IsAllowed(file.FileName)) return BadRequest(new { error = "Format refusé : PDF, image, Office ou texte uniquement." });

        var stored = await Services.DocumentStorage.SaveAsync(env, file, userId, ct);
        var doc = new Core.Entities.ActionDocument
        {
            PlanActionId = id, FileName = Path.GetFileName(file.FileName), FilePath = stored, FileType = file.ContentType ?? string.Empty,
            UploadedBy = userId, CreatedBy = userId,
        };
        _db.ActionDocuments.Add(doc);
        // the proof is part of the action's history, next to its progress changes
        _db.PlanActionHistories.Add(new Core.Entities.PlanActionHistory
        {
            PlanActionId = id, ChangedBy = userId, OldProgress = action.Progress, NewProgress = action.Progress,
            Note = $"Preuve ajoutée : {doc.FileName}", CreatedBy = userId, UpdatedAt = DateTime.UtcNow, UpdatedBy = userId,
        });
        await _db.SaveChangesAsync(ct);
        return Ok(new { doc.Id, doc.FileName, doc.FileType, doc.UploadedBy, doc.CreatedAt });
    }

    [HttpGet("{id:guid}/documents")]
    public async Task<IActionResult> GetProofs(Guid id, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });

        var action = await _db.PlanActions.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (action is null) return NotFound();
        if (!await CanAccessPlanAsync(action.ActionPlanId, userId)) return Forbid();

        var docs = await _db.ActionDocuments.AsNoTracking().Where(d => d.PlanActionId == id && !d.IsArchived)
            .OrderBy(d => d.CreatedAt).Select(d => new { d.Id, d.FileName, d.FileType, d.UploadedBy, d.CreatedAt }).ToListAsync(ct);
        var uploaders = docs.Select(d => d.UploadedBy).Where(u => !string.IsNullOrWhiteSpace(u)).Distinct().ToList();
        var names = await _db.UserProfiles.AsNoTracking().Where(u => uploaders.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name, ct);
        return Ok(docs.Select(d => new { d.Id, d.FileName, d.FileType, d.UploadedBy, UploadedByName = names.GetValueOrDefault(d.UploadedBy), d.CreatedAt }));
    }

    /// <summary>The file of one proof, for the people who can see the plan.</summary>
    [HttpGet("documents/{documentId:guid}/file")]
    public async Task<IActionResult> DownloadProof(Guid documentId, [FromServices] IWebHostEnvironment env, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });

        var doc = await _db.ActionDocuments.AsNoTracking().Include(d => d.PlanAction).FirstOrDefaultAsync(d => d.Id == documentId && !d.IsArchived, ct);
        if (doc is null) return NotFound();
        if (!await CanAccessPlanAsync(doc.PlanAction.ActionPlanId, userId)) return Forbid();

        var path = Services.DocumentStorage.Resolve(env, doc.FilePath);
        if (path is null || !System.IO.File.Exists(path)) return NotFound();
        return PhysicalFile(path, string.IsNullOrWhiteSpace(doc.FileType) ? "application/octet-stream" : doc.FileType, doc.FileName);
    }

    [HttpGet("overdue")]
    public async Task<IActionResult> GetOverdue()
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        var actions = (await _service.GetOverdueAsync()).ToList();
        if (IsQualityAdmin())
        {
            var ids = await _actionPlanService.GetVisibleIdsAsync(userId, IsSuperAdmin());
            return Ok(actions.Where(a => ids.Contains(a.ActionPlanId)).ToList());
        }

        var mine = actions.Where(a =>
            string.Equals(a.AssignedToId, userId, StringComparison.OrdinalIgnoreCase)).ToList();
        return Ok(mine);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePlanActionDto dto)
    {
        var createdBy = CurrentUserId() ?? "system";
        if (!IsQualityAdmin() && !await CanAccessPlanAsync(dto.ActionPlanId, createdBy))
            return Forbid();

        var action = await _service.CreateAsync(dto, createdBy);
        return CreatedAtAction(nameof(GetById), new { id = action.Id }, action);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePlanActionDto dto)
    {
        var userId = CurrentUserId() ?? "system";
        var existing = await _service.GetByIdAsync(id);
        if (existing is null) return NotFound();
        if (!await CanAccessPlanAsync(existing.ActionPlanId, userId))
            return Forbid();

        var action = await _service.UpdateAsync(id, dto, userId);
        return Ok(action);
    }

    public sealed class ExtendActionDeadlineRequest
    {
        public DateTime? NewDeadline { get; set; }
        public string? Reason { get; set; }
    }

    /// <summary>
    /// Administrators and super administrators: more time for a late sub-action that is not finished. A reason is required; the old
    /// date, the new date and the reason are kept in the sub-action's history. A date is never moved backwards.
    /// </summary>
    [HttpPost("{id:guid}/deadline-extension")]
    public async Task<IActionResult> ExtendDeadline(Guid id, [FromBody] ExtendActionDeadlineRequest request)
    {
        if (!Services.PermissionAccess.Has(User, Services.PermissionAccess.ExtendDeadline)) return Forbid();
        var by = CurrentUserId();
        if (string.IsNullOrEmpty(by)) return Unauthorized(new { code = "unauthenticated", message = "Utilisateur non authentifié." });
        if (request?.NewDeadline is null) return BadRequest(new { code = "newDateRequired", message = "La nouvelle date est requise." });

        var existing = await _service.GetByIdAsync(id);
        if (existing is null || !(await _actionPlanService.GetVisibleIdsAsync(by, IsSuperAdmin())).Contains(existing.ActionPlanId))
            return NotFound(new { code = "notFound", message = "Sous-action non trouvée." });

        var result = await _service.ExtendDeadlineAsync(id, request.NewDeadline.Value, request.Reason ?? string.Empty, by);
        return result.Code switch
        {
            null => Ok(new { oldDeadline = result.OldDeadline, newDeadline = result.NewDeadline, extraDays = result.ExtraDays }),
            "notFound" => NotFound(new { code = result.Code, message = "Sous-action non trouvée." }),
            _ => BadRequest(new { code = result.Code, message = "Prolongation refusée : " + result.Code }),
        };
    }

    public sealed class ReassignRequest
    {
        public string? UserId { get; set; }
        public string? Note { get; set; }
    }

    /// <summary>Administrators: gives one sub-action to another person. Kept in the sub-action's assignment history.</summary>
    [HttpPost("{id:guid}/reassign")]
    public async Task<IActionResult> Reassign(Guid id, [FromBody] ReassignRequest request)
    {
        if (!IsQualityAdmin() && !Services.PermissionAccess.Has(User, Services.PermissionAccess.Reassign)) return Forbid();
        var by = CurrentUserId();
        if (string.IsNullOrEmpty(by)) return Unauthorized(new { error = "Utilisateur non authentifié." });
        var existing = await _service.GetByIdAsync(id);
        if (existing is null || !(await _actionPlanService.GetVisibleIdsAsync(by, IsSuperAdmin())).Contains(existing.ActionPlanId))
            return NotFound(new { error = "Sous-action non trouvée." });
        if ((request.Note ?? string.Empty).Length > 300)
            return BadRequest(new { error = "Le motif ne doit pas dépasser 300 caractères." });

        try
        {
            await _service.ReassignAsync(id, request.UserId ?? string.Empty, by, request.Note);
            return Ok(new { id, assignedToId = request.UserId?.Trim() });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    public sealed class UpdateDescriptionRequest
    {
        public string? Description { get; set; }
    }

    /// <summary>
    /// Rewrites the description of a sub-action. The old and the new text are kept in the sub-action's history (and appear in the
    /// plan's history); nothing is overwritten silently. A validated or cancelled sub-action stays as it is.
    /// </summary>
    [HttpPatch("{id:guid}/description")]
    public async Task<IActionResult> UpdateDescription(Guid id, [FromBody] UpdateDescriptionRequest request, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });

        var action = await _db.PlanActions.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (action == null) return NotFound(new { error = "Sous-action non trouvée." });
        if (!await CanAccessPlanAsync(action.ActionPlanId, userId)) return Forbid();
        if (action.Progress == ActionProgress.Validated || action.Progress == ActionProgress.Cancelled)
            return BadRequest(new { error = "Cette sous-action est verrouillée." });

        var text = (request.Description ?? string.Empty).Trim();
        if (text.Length == 0) return BadRequest(new { error = "La description est obligatoire." });
        if (text.Length > 4000) return BadRequest(new { error = "La description ne doit pas dépasser 4000 caractères." });

        var previous = action.Description ?? string.Empty;
        if (string.Equals(previous.Trim(), text, StringComparison.Ordinal))
            return BadRequest(new { error = "La description n'a pas changé." });

        action.Description = text;
        action.UpdatedBy = userId;
        action.UpdatedAt = DateTime.UtcNow;
        _db.PlanActionHistories.Add(new Core.Entities.PlanActionHistory
        {
            PlanActionId = id, ChangedBy = userId, OldProgress = action.Progress, NewProgress = action.Progress,
            Note = "Description modifiée", OldDescription = previous, NewDescription = text,
            CreatedBy = userId, UpdatedAt = DateTime.UtcNow, UpdatedBy = userId,
        });
        await _db.SaveChangesAsync(ct);
        return Ok(new { id, description = text });
    }

    [HttpPatch("{id}/progress")]
    public async Task<IActionResult> UpdateProgress(Guid id, [FromBody] UpdateProgressDto dto)
    {
        var userId = CurrentUserId() ?? "system";

        try
        {
            await _service.UpdateProgressAsync(id, dto, userId);
            return Ok(new { message = "Progression mise à jour." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Sous-action non trouvée." });
        }
        catch (Exception)
        {
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    /// <summary>Administrators only: validates a sub-action that was finished at 100 %.</summary>
    [HttpPost("{id}/validate")]
    public async Task<IActionResult> Validate(Guid id, [FromBody] ValidatePlanActionDto? dto)
    {
        if (!IsQualityAdmin()) return Forbid();
        var userId = CurrentUserId() ?? "system";
        var circuit = await Coficab.ActionPlan.Application.Dashboard.ThresholdsStore.LoadCircuitAsync(_db, HttpContext.RequestAborted);
        if (circuit.ValidatorsSuperOnly && !IsSuperAdmin())
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Selon le circuit de validation, seul un superadmin peut valider une sous-action." });

        try
        {
            await _service.ValidateAsync(id, userId, dto?.Note);
            var closed = circuit.AutoCloseOnValidation && await TryAutoCloseAsync(id, userId);
            return Ok(new { message = closed ? "Sous-action validée : le plan est clôturé." : "Sous-action validée.", planClosed = closed });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Sous-action non trouvée." });
        }
    }

    /// <summary>Administrators only: sends a finished sub-action back to its assignee, with the reason.</summary>
    [HttpPost("{id}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] PlanActionMessageDto dto)
    {
        if (!IsQualityAdmin()) return Forbid();
        var circuit = await Coficab.ActionPlan.Application.Dashboard.ThresholdsStore.LoadCircuitAsync(_db, HttpContext.RequestAborted);
        if (circuit.ValidatorsSuperOnly && !IsSuperAdmin())
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Selon le circuit de validation, seul un superadmin peut rejeter une sous-action." });
        return await RunAdminActionAsync(() => _service.RejectAsync(id, CurrentUserId() ?? "system", dto.Message), "Sous-action rejetée.");
    }

    /// <summary>Administrators only: warns the person in charge of a sub-action.</summary>
    [HttpPost("{id}/warn")]
    public async Task<IActionResult> Warn(Guid id, [FromBody] PlanActionMessageDto dto)
    {
        if (!IsQualityAdmin()) return Forbid();
        return await RunAdminActionAsync(() => _service.WarnAsync(id, CurrentUserId() ?? "system", dto.Message), "Avertissement envoyé.");
    }

    /// <summary>Closes the plan of a sub-action when every one of its sub-actions is now validated (circuit option).</summary>
    private async Task<bool> TryAutoCloseAsync(Guid planActionId, string userId)
    {
        var action = (await _service.GetByIdAsync(planActionId));
        if (action == null) return false;
        var plan = await _actionPlanService.GetByIdAsync(action.ActionPlanId);
        if (plan == null || plan.Status == ActionPlanStatus.Closed || plan.Status == ActionPlanStatus.Archived) return false;
        var all = (await _service.GetByActionPlanAsync(action.ActionPlanId)).ToList();
        if (all.Count == 0 || all.Any(a => a.Progress != ActionProgress.Validated)) return false;

        await _actionPlanService.UpdateAsync(plan.Id, new Coficab.ActionPlan.Core.DTOs.ActionPlan.UpdateActionPlanDto
        {
            Title = plan.Title, Description = plan.Description, Status = ActionPlanStatus.Closed, Type = plan.Type,
            OrganizationId = plan.OrganizationId, DepartmentId = plan.DepartmentId, AssignedToId = plan.AssignedToId, Deadline = plan.Deadline,
        }, userId);
        return true;
    }

    private async Task<IActionResult> RunAdminActionAsync(Func<Task> run, string done)
    {
        try
        {
            await run();
            return Ok(new { message = done });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Sous-action non trouvée." });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Archive(Guid id)
    {
        var userId = CurrentUserId() ?? "system";
        var existing = await _service.GetByIdAsync(id);
        if (existing is null) return NotFound();
        if (!await CanAccessPlanAsync(existing.ActionPlanId, userId))
            return Forbid();

        await _service.ArchiveAsync(id, userId);
        return NoContent();
    }

    [HttpPost("{id}/restore")]
    public async Task<IActionResult> Restore(Guid id)
    {
        try
        {
            var restoredBy = CurrentUserId() ?? "system";
            var existing = await _service.GetByIdAsync(id);
            if (existing is null) return NotFound(new { error = "Sous-action non trouvée." });
            if (!await CanAccessPlanAsync(existing.ActionPlanId, restoredBy))
                return Forbid();

            await _service.RestoreAsync(id, restoredBy);
            return Ok(new { message = "Action restaurée avec succès" });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Sous-action non trouvée." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("by-user/{userId}")]
    public async Task<IActionResult> GetByUser(string userId)
    {
        var currentUserId = CurrentUserId();
        if (string.IsNullOrEmpty(currentUserId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        if (!IsQualityAdmin()
            && !string.Equals(userId.Trim(), currentUserId, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var actions = await _service.GetByAssignedUserAsync(userId);
        return Ok(actions);
    }

    /// <summary>A progress value as a percentage for the screens (validated shows as 100, cancelled as 0).</summary>
    private static int Percent(ActionProgress p) => p == ActionProgress.Validated ? 100 : p == ActionProgress.Cancelled ? 0 : (int)p;

    /// <summary>Who was given, or taken off, a sub-action, and by whom.</summary>
    [HttpGet("{id:guid}/assignment-history")]
    public async Task<IActionResult> GetAssignmentHistory(Guid id)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        var existing = await _service.GetByIdAsync(id);
        if (existing is null) return NotFound();
        if (!await CanAccessPlanAsync(existing.ActionPlanId, userId))
            return Forbid();

        var rows = (await _service.GetAssignmentHistoryAsync(id)).OrderByDescending(h => h.CreatedAt).ToList();
        var ids = rows.SelectMany(h => new[] { h.ChangedBy, h.OldAssignedToId, h.NewAssignedToId }).OfType<string>().Where(u => u.Length > 0).Distinct().ToList();
        var names = await _db.UserProfiles.AsNoTracking().Where(u => ids.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name, StringComparer.OrdinalIgnoreCase);
        string? Name(string? uid, string? stored) => !string.IsNullOrWhiteSpace(uid) && names.TryGetValue(uid, out var n) ? n : stored;
        return Ok(rows.Select(h => new
        {
            h.Id, h.PlanActionId, h.ChangedBy, ChangedByName = Name(h.ChangedBy, h.ChangedByName), h.ActionType,
            h.OldAssignedToId, h.NewAssignedToId, OldAssignedToName = Name(h.OldAssignedToId, h.OldAssignedToName), NewAssignedToName = Name(h.NewAssignedToId, h.NewAssignedToName),
            h.Note, h.CreatedAt,
        }));
    }

    [HttpGet("{id}/history")]
    public async Task<IActionResult> GetHistory(Guid id)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        var existing = await _service.GetByIdAsync(id);
        if (existing is null) return NotFound();
        if (!await CanAccessPlanAsync(existing.ActionPlanId, userId))
            return Forbid();

        // a plain projection: the raw entity points back to its action and plan (a cycle the serializer refuses)
        var history = (await _service.GetProgressHistoryAsync(id)).OrderByDescending(h => h.CreatedAt).ToList();
        var ids = history.Select(h => h.ChangedBy).Where(u => !string.IsNullOrWhiteSpace(u)).Distinct().ToList();
        var names = await _db.UserProfiles.AsNoTracking().Where(u => ids.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);
        return Ok(history.Select(h => new
        {
            h.Id, h.PlanActionId, h.ChangedBy, ChangedByName = names.GetValueOrDefault(h.ChangedBy),
            OldProgress = Percent(h.OldProgress), NewProgress = Percent(h.NewProgress), h.Note, h.OldDescription, h.NewDescription, h.CreatedAt,
        }));
    }
}
