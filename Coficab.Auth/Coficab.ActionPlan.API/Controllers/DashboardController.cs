using Coficab.ActionPlan.Application.Dashboard.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly IMediator _mediator;

    public DashboardController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Management overview: headline figures, actions, problems, trend and data health, for the last <paramref name="days"/> days.</summary>
    [HttpGet("overview")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<OverviewDto>> GetOverview([FromQuery] int days = 90, [FromQuery] Guid? organizationId = null, CancellationToken cancellationToken = default)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var superAdmin = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));
        return Ok(await _mediator.Send(new GetOverviewQuery(days, userId, superAdmin, organizationId), cancellationToken));
    }

    /// <summary>Vue globale Claims + Action Plans (KPIs, top retards, courbes, donuts, responsables).</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummaryDto>> GetSummary(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var superAdmin = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));
        var result = await _mediator.Send(new GetDashboardSummaryQuery(userId, superAdmin), cancellationToken);
        return Ok(result);
    }
}
