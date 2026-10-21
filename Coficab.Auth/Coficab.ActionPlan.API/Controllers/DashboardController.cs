using Coficab.ActionPlan.Application.Dashboard;
using Coficab.ActionPlan.Application.Dashboard.Queries;
using Coficab.ActionPlan.Application.Interfaces;
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
    private readonly IApplicationDbContext _db;
    private readonly IConfiguration _configuration;

    public DashboardController(IMediator mediator, IApplicationDbContext db, IConfiguration configuration)
    {
        _mediator = mediator;
        _db = db;
        _configuration = configuration;
    }

    /// <summary>Management overview: headline figures, actions, problems, trend and data health, for the last <paramref name="days"/> days.</summary>
    [HttpGet("overview")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<OverviewDto>> GetOverview([FromQuery] int days = 90, [FromQuery] string? organizationIds = null, CancellationToken cancellationToken = default)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var superAdmin = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));
        return Ok(await _mediator.Send(new GetOverviewQuery(days, userId, superAdmin, ParseOrganizations(organizationIds)), cancellationToken));
    }

    /// <summary>CAPA indicators computed on the plans (open, late, closed on time, by type, by department, monthly), for the last <paramref name="days"/> days.</summary>
    [HttpGet("capa-indicators")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<CapaIndicatorsDto>> GetCapaIndicators([FromQuery] int days = 90, [FromQuery] string? organizationIds = null, [FromQuery] Guid? departmentId = null, CancellationToken cancellationToken = default)
        => Ok(await _mediator.Send(new GetCapaIndicatorsQuery(days, ParseOrganizations(organizationIds), departmentId), cancellationToken));

    /// <summary>Who carries the CAPA plans: open and late plans per person, for the followed organizations.</summary>
    [HttpGet("capa-workload")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<CapaWorkloadDto>> GetCapaWorkload([FromQuery] string? organizationIds = null, CancellationToken cancellationToken = default)
        => Ok(await _mediator.Send(new GetCapaWorkloadQuery(ParseOrganizations(organizationIds)), cancellationToken));

    /// <summary>The targets the overview's traffic lights are compared with.</summary>
    [HttpGet("overview/targets")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<OverviewTargetsDto>> GetOverviewTargets(CancellationToken cancellationToken)
        => Ok(await OverviewTargetsStore.LoadAsync(_db, _configuration, cancellationToken));

    /// <summary>Saves new targets (superadmin only). Returns 400 with the name of the first invalid field.</summary>
    [HttpPut("overview/targets")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SetOverviewTargets([FromBody] OverviewTargetsDto targets, CancellationToken cancellationToken)
    {
        if (!IsSuperAdmin()) return Forbid();
        var problem = OverviewTargetsStore.Validate(targets);
        if (problem != null) return BadRequest(new { field = problem });
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        await OverviewTargetsStore.SaveAsync(_db, targets, userId, cancellationToken);
        return Ok(await OverviewTargetsStore.LoadAsync(_db, _configuration, cancellationToken));
    }

    /// <summary>Back to the default targets (superadmin only).</summary>
    [HttpDelete("overview/targets")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<OverviewTargetsDto>> ResetOverviewTargets(CancellationToken cancellationToken)
    {
        if (!IsSuperAdmin()) return Forbid();
        await OverviewTargetsStore.ResetAsync(_db, cancellationToken);
        return Ok(await OverviewTargetsStore.LoadAsync(_db, _configuration, cancellationToken));
    }

    private static IReadOnlyList<Guid>? ParseOrganizations(string? raw) => OrganizationFilter.Parse(raw);

    private bool IsSuperAdmin() => User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
        .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));

    /// <summary>Vue globale Claims + Action Plans (KPIs, top retards, courbes, donuts, responsables).</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummaryDto>> GetSummary([FromQuery] string? organizationIds = null, CancellationToken cancellationToken = default)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var superAdmin = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));
        var result = await _mediator.Send(new GetDashboardSummaryQuery(userId, superAdmin, ParseOrganizations(organizationIds)), cancellationToken);
        return Ok(result);
    }
}
