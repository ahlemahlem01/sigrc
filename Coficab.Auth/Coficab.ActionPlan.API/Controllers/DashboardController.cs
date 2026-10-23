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

    /// <summary>The claims report: totals, closures and delays overall and by severity, department and defect type.</summary>
    [HttpGet("claims-report")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims.ClaimsReportDto>> GetClaimsReport([FromQuery] string? organizationIds = null, CancellationToken cancellationToken = default)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Ok(await _mediator.Send(
            IsSuperAdmin()
                ? new Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims.GetClaimsReportQuery(organizationIds)
                : new Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims.GetClaimsReportQuery(null, userId),
            cancellationToken));
    }

    public sealed record TeamPerformanceItem(
        string UserId, int ClaimsOpen, int ClaimsClosed, int ClaimsLate, double? ClaimsAvgClosureDays,
        int PlansOpen, int PlansClosed, int PlansLate, int ActionsOpen, int ActionsLate, int ActionsToValidate, int ActionsDoneLast30Days,
        string PlansActivity, string ClaimsActivity);

    /// <summary>
    /// Figures per person for the team reports, from the server: claims (assigned person, else creator), plans and
    /// sub-actions (as in the workload page) and the activity of each stream. The same rules as everywhere else.
    /// </summary>
    [HttpGet("team-performance")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<IReadOnlyList<TeamPerformanceItem>>> GetTeamPerformance(
        [FromQuery] string? organizationIds = null,
        [FromServices] Coficab.ActionPlan.Application.Interfaces.IEmployeeActivityService? activity = null,
        CancellationToken cancellationToken = default)
    {
        var workload = await _mediator.Send(new GetCapaWorkloadQuery(ParseOrganizations(organizationIds)), cancellationToken);
        var claims = await _mediator.Send(new Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims.GetClaimsByPersonQuery(organizationIds), cancellationToken);
        var plansActivity = activity == null ? new() : (await activity.GetScopedSummaryAsync("plans", cancellationToken)).Items.ToDictionary(i => i.UserId, i => i.ActivityStatus.ToString(), StringComparer.OrdinalIgnoreCase);
        var claimsActivity = activity == null ? new() : (await activity.GetScopedSummaryAsync("claims", cancellationToken)).Items.ToDictionary(i => i.UserId, i => i.ActivityStatus.ToString(), StringComparer.OrdinalIgnoreCase);

        var ids = workload.People.Select(p => p.UserId).Concat(claims.Select(c => c.UserId)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var items = ids.Select(id =>
        {
            var w = workload.People.FirstOrDefault(p => string.Equals(p.UserId, id, StringComparison.OrdinalIgnoreCase));
            var c = claims.FirstOrDefault(x => string.Equals(x.UserId, id, StringComparison.OrdinalIgnoreCase));
            return new TeamPerformanceItem(
                id, c?.Open ?? 0, c?.Closed ?? 0, c?.Late ?? 0, c?.AvgClosureDays,
                w?.OpenPlans ?? 0, w?.ClosedPlans ?? 0, w?.LatePlans ?? 0, w?.OpenActions ?? 0, w?.LateActions ?? 0, w?.ActionsToValidate ?? 0, w?.ActionsDoneLast30Days ?? 0,
                plansActivity.TryGetValue(id, out var pa) ? pa : "Inactive", claimsActivity.TryGetValue(id, out var ca) ? ca : "Inactive");
        }).ToList();
        return Ok(items);
    }

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
    public async Task<ActionResult<DashboardSummaryDto>> GetSummary([FromQuery] string? organizationIds = null, [FromQuery] Guid? departmentId = null, CancellationToken cancellationToken = default)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var superAdmin = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));
        var result = await _mediator.Send(new GetDashboardSummaryQuery(userId, superAdmin, ParseOrganizations(organizationIds), departmentId), cancellationToken);
        return Ok(result);
    }
}
