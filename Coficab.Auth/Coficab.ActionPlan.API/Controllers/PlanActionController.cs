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
        return Ok(actions);
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

        var history = await _service.GetProgressHistoryAsync(id);
        return Ok(history);
    }
}
