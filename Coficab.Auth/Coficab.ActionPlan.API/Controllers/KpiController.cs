using System.Security.Claims;
using Coficab.ActionPlan.Application.Kpi;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>Claims KPIs of the dashboard: claims per month, average treatment time, PPM per client, top defects.</summary>
[ApiController]
[Authorize]
[Route("api/kpi")]
public class KpiController : ControllerBase
{
    private readonly IMediator _mediator;

    public KpiController(IMediator mediator) => _mediator = mediator;

    [HttpGet("claims")]
    public async Task<IActionResult> Claims([FromQuery] int months = 12, [FromQuery] string? organizationIds = null, [FromQuery] Guid? departmentId = null, CancellationToken ct = default)
    {
        var roles = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant()).ToList();
        var superAdmin = roles.Contains("superadmin");
        if (!superAdmin && !roles.Contains("admin")) return Forbid();

        // Same visibility as the claims list: an admin only gets the KPIs of the claims they can see.
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Ok(await _mediator.Send(new GetClaimKpisQuery(superAdmin ? null : userId, months, Application.QualityAnalyses.ClaimOrganizations.Parse(organizationIds), departmentId), ct));
    }
}
