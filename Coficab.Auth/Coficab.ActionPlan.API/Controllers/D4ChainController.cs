using Coficab.ActionPlan.Core.Entities;
using System.Security.Claims;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>Status of the D4 chain for a claim, and the admin release (recorded, never deleted).</summary>
[ApiController]
[Authorize]
[Route("api/d4-chain")]
public class D4ChainController : ControllerBase
{
    private readonly ActionPlanDbContext _db;
    private readonly D4ChainService _chain;

    public D4ChainController(ActionPlanDbContext db, D4ChainService chain)
    {
        _db = db;
        _chain = chain;
    }

    public sealed class OverrideRequest
    {
        public string? Reason { get; set; }
    }

    [HttpGet("{claimId:guid}")]
    public async Task<IActionResult> Get(Guid claimId, CancellationToken ct)
    {
        var error = await AuthorizeAsync(claimId, adminOnly: false, ct);
        if (error != null) return error;
        return Ok(await _chain.EvaluateAsync(claimId, ct));
    }

    [HttpPost("{claimId:guid}/override")]
    public async Task<IActionResult> Release(Guid claimId, [FromBody] OverrideRequest request, CancellationToken ct)
    {
        var error = await AuthorizeAsync(claimId, adminOnly: true, ct);
        if (error != null) return error;

        var reason = (request.Reason ?? string.Empty).Trim();
        if (reason.Length < 10 || reason.Length > 500)
            return BadRequest(new { message = "Le motif est obligatoire (10 à 500 caractères)." });

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";
        var userName = User.FindFirst("name")?.Value ?? User.Identity?.Name;
        var now = DateTime.UtcNow;

        _db.D4Overrides.Add(new D4Override { ClaimId = claimId, Reason = reason, ByUserId = userId, ByUserName = userName, At = now });
        await _db.SaveChangesAsync(ct);

        return Ok(await _chain.EvaluateAsync(claimId, ct));
    }

    private async Task<IActionResult?> AuthorizeAsync(Guid claimId, bool adminOnly, CancellationToken ct)
    {
        var claim = await _db.Claims.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(c => c.Id == claimId, ct);
        if (claim == null) return NotFound(new { message = "Réclamation introuvable." });

        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant());
        if (roles.Any(r => r is "admin" or "superadmin")) return null;
        if (adminOnly) return Forbid();

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var mine = string.Equals(claim.CreatedById, userId, StringComparison.OrdinalIgnoreCase)
                   || string.Equals(claim.AssignedToId, userId, StringComparison.OrdinalIgnoreCase);
        return mine ? null : Forbid();
    }
}
