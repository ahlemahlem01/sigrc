using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.DTOs.Ishikawa;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Ishikawa;
using Coficab.ActionPlan.Core.DTOs.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class IshikawaController : ControllerBase
{
    private readonly ISender _mediator;
    private readonly D4ChainService _d4Chain;
    private readonly Coficab.ActionPlan.Application.Interfaces.IApplicationDbContext _db;

    public IshikawaController(ISender mediator, D4ChainService d4Chain, Coficab.ActionPlan.Application.Interfaces.IApplicationDbContext db)
    {
        _mediator = mediator;
        _d4Chain = d4Chain;
        _db = db;
    }

    /// <summary>The Ishikawa comes after D3: causes cannot be added before the containment is done (unless already started).</summary>
    private async Task<ConflictObjectResult?> EnsureOpenAsync(Guid claimId)
    {
        if (await Services.ClosedDossier.IsClosedAsync(_db, claimId, HttpContext.RequestAborted))
            return Conflict(Services.ClosedDossier.Refusal);
        var chain = await _d4Chain.EvaluateAsync(claimId, HttpContext.RequestAborted);
        return chain.Tools.Ishikawa.Open
            ? null
            : Conflict(new { message = "L'Ishikawa s'ouvre une fois le confinement (D3) terminé.", tool = "ishikawa", reason = chain.Tools.Ishikawa.Reason });
    }

    /// <summary>
    /// Gets all active Ishikawa causes grouped by category for a specific claim.
    /// </summary>
    [HttpGet("claims/{claimId:guid}")]
    public async Task<ActionResult<IshikawaDetailsDto>> GetByClaimId(Guid claimId)
    {
        var result = await _mediator.Send(new GetIshikawaByClaimIdQuery(claimId));
        if (result == null)
            return NotFound($"No active Ishikawa diagram found for Claim ID: {claimId}");

        return Ok(result);
    }

    /// <summary>
    /// Context-aware Ishikawa generation: plant history (Red) + industry KB (Yellow) + hypotheses (Green).
    /// </summary>
    [HttpPost("claims/{claimId:guid}/suggest-causes")]
    public async Task<ActionResult<SuggestIshikawaCausesResponseDto>> SuggestCauses(
        Guid claimId,
        [FromBody] SuggestIshikawaCausesRequestDto? body)
    {
        var blocked = await EnsureOpenAsync(claimId);
        if (blocked != null) return blocked;

        var request = body ?? new SuggestIshikawaCausesRequestDto();
        request.ClaimId = claimId;
        try
        {
            var result = await _mediator.Send(new SuggestIshikawaCausesQuery(request));
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
    }

    /// <summary>
    /// Adds a new cause under a specific category in the Ishikawa diagram.
    /// </summary>
    [HttpPost("causes")]
    public async Task<ActionResult<Guid>> CreateCause([FromBody] CreateIshikawaCauseCommand command)
    {
        var blocked = await EnsureOpenAsync(command.ClaimId);
        if (blocked != null) return blocked;

        var causeId = await _mediator.Send(command);
        return CreatedAtAction(nameof(GetByClaimId), new { claimId = command.ClaimId }, causeId);
    }

    /// <summary>
    /// Soft deletes/archives a specific cause from the diagram.
    /// </summary>
    [HttpPut("causes/{causeId:guid}/archive")]
    public async Task<IActionResult> ArchiveCause(Guid causeId, [FromBody] ArchiveIshikawaCauseRequest request)
    {
        var cause = await _db.IshikawaCauses.AsNoTracking().FirstOrDefaultAsync(c => c.Id == causeId, HttpContext.RequestAborted);
        if (cause != null && await Services.ClosedDossier.IsClosedAsync(_db, cause.ClaimId, HttpContext.RequestAborted))
            return Conflict(Services.ClosedDossier.Refusal);

        var command = new ArchiveIshikawaCauseCommand(
            causeId,
            request.ArchivedBy,
            request.ArchiveReason
        );

        var success = await _mediator.Send(command);
        if (!success)
            return NotFound($"Cause with ID {causeId} not found.");

        return NoContent();
    }
}

public record ArchiveIshikawaCauseRequest(
    string ArchivedBy,
    string? ArchiveReason
);
