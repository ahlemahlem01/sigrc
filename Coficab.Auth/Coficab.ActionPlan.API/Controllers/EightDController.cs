using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Workflow;
using Coficab.ActionPlan.Core.DTOs.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/EightD")]
[Authorize]
public class EightDController : ControllerBase
{
    private readonly IEightDService _service;
    private readonly IApplicationDbContext _db;
    private readonly IClaimWorkflow _workflow;

    public EightDController(IEightDService service, IApplicationDbContext db, IClaimWorkflow workflow)
    {
        _service = service;
        _db = db;
        _workflow = workflow;
    }

    [HttpGet("pending")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetPending([FromQuery] string? organizationIds = null, CancellationToken ct = default)
    {
        var list = await _service.GetPendingAsync(ct);
        if (ClaimOrganizations.Parse(organizationIds) is { } followed)
        {
            var ids = await (await ClaimOrganizations.ApplyAsync(_db, _db.Claims.AsNoTracking(), followed, ct)).Select(c => c.Id).ToListAsync(ct);
            list = list.Where(d => ids.Contains(d.ClaimId)).ToList();
        }
        return Ok(list);
    }

    [HttpGet("{claimId:guid}")]
    public async Task<IActionResult> Get(Guid claimId, CancellationToken ct)
    {
        try
        {
            var userId = CurrentUserId();
            if (!IsQualityAdmin() && !await UserCanAccessClaimAsync(claimId, userId, ct))
                return Forbid();

            var dto = await _service.GetOrCreateAsync(claimId, userId, ct);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{claimId:guid}")]
    public async Task<IActionResult> Save(Guid claimId, [FromBody] SaveEightDDossierDto dto, CancellationToken ct)
    {
        try
        {
            var userId = CurrentUserId();
            if (!IsQualityAdmin() && !await UserCanAccessClaimAsync(claimId, userId, ct))
                return Forbid();

            var result = await _service.SaveAsync(claimId, dto, userId, ct);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{claimId:guid}/submit")]
    public async Task<IActionResult> Submit(Guid claimId, CancellationToken ct)
    {
        try
        {
            var userId = CurrentUserId();
            if (!IsQualityAdmin() && !await UserCanAccessClaimAsync(claimId, userId, ct))
                return Forbid();

            var blocked = await WorkflowBlockAsync(claimId, "PENDING_VALIDATION", ct);
            if (blocked != null) return blocked;

            var result = await _service.SubmitAsync(claimId, userId, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{claimId:guid}/validate")]
    public async Task<IActionResult> Validate(Guid claimId, [FromBody] ValidateEightDDossierDto dto, CancellationToken ct)
    {
        if (!IsQualityAdmin() && !Services.PermissionAccess.Has(User, Services.PermissionAccess.ValidateEightD)) return Forbid();
        try
        {
            var blocked = await WorkflowBlockAsync(claimId, dto.IsApproved ? "CLOTUREE" : "EN_ANALYSE", ct);
            if (blocked != null) return blocked;

            var result = await _service.ValidateAsync(claimId, dto, CurrentUserId(), ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{claimId:guid}/pdf")]
    public async Task<IActionResult> DownloadPdf(Guid claimId, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (!IsQualityAdmin() && !await UserCanAccessClaimAsync(claimId, userId, ct))
            return Forbid();

        var bytes = await _service.GetOrGenerateCustomerPdfAsync(claimId, userId, ct);
        return File(bytes, "application/pdf", $"8D_Client_{claimId.ToString()[..8]}.pdf");
    }

    [HttpPost("{claimId:guid}/pdf")]
    public async Task<IActionResult> GeneratePdf(Guid claimId, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (!IsQualityAdmin() && !await UserCanAccessClaimAsync(claimId, userId, ct))
            return Forbid();

        if (await Services.ClosedDossier.IsClosedAsync(_db, claimId, ct))
            return Conflict(Services.ClosedDossier.Refusal);

        var bytes = await _service.RegenerateCustomerPdfAsync(claimId, userId, ct);
        return File(bytes, "application/pdf", $"8D_Client_{claimId.ToString()[..8]}.pdf");
    }

    [HttpGet("{claimId:guid}/versions")]
    public async Task<IActionResult> Versions(Guid claimId, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (!IsQualityAdmin() && !await UserCanAccessClaimAsync(claimId, userId, ct))
            return Forbid();
        return Ok(await _service.GetVersionsAsync(claimId, ct));
    }

    [HttpGet("{claimId:guid}/versions/{version:int}")]
    public async Task<IActionResult> Version(Guid claimId, int version, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (!IsQualityAdmin() && !await UserCanAccessClaimAsync(claimId, userId, ct))
            return Forbid();
        var detail = await _service.GetVersionAsync(claimId, version, ct);
        return detail == null ? NotFound(new { message = "Version introuvable." }) : Ok(detail);
    }

    /// <summary>409 with the allowed next statuses when the configured workflow forbids this move; null when it is allowed.</summary>
    private async Task<IActionResult?> WorkflowBlockAsync(Guid claimId, string to, CancellationToken ct)
    {
        var from = await _db.Claims.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.Id == claimId).Select(c => c.StatusCode).FirstOrDefaultAsync(ct);
        if (from == null) return null;
        var roles = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role)).Select(c => c.Value);
        var decision = await _workflow.CheckAsync(from, to, roles, ct);
        return decision.Allowed
            ? null
            : Conflict(new { message = decision.Message, code = "workflow", allowed = decision.AllowedTargets });
    }

    private string CurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")
        ?? "system";

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

    private async Task<bool> UserCanAccessClaimAsync(Guid claimId, string userId, CancellationToken ct)
    {
        var uid = userId.Trim().ToLowerInvariant();
        return await _db.Claims.AsNoTracking().AnyAsync(c =>
            c.Id == claimId && (
                (c.AssignedToId != null && c.AssignedToId.ToLower() == uid)
                || (c.CreatedById != null && c.CreatedById.ToLower() == uid)
                || _db.EightDDossiers.Any(d =>
                    d.ClaimId == c.Id
                    && d.ChampionId != null
                    && d.ChampionId.ToLower() == uid)
                || _db.ActionPlans.Any(p =>
                    p.ClaimId == c.Id
                    && !p.IsArchived
                    && (
                        (p.AssignedToId != null && p.AssignedToId.ToLower() == uid)
                        || _db.UserActionPlanAssignments.Any(a =>
                            a.ActionPlanId == p.Id && a.UserId.ToLower() == uid)
                        || _db.PlanActions.Any(pa =>
                            pa.ActionPlanId == p.Id
                            && !pa.IsArchived
                            && pa.AssignedToId != null
                            && pa.AssignedToId.ToLower() == uid)
                    ))
            ), ct);
    }
}
