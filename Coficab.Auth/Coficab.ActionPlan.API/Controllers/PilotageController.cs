using Coficab.ActionPlan.Application.Dashboard;
using Coficab.ActionPlan.Application.Dashboard.Queries;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// What an administrator has to decide or watch, in one request: files waiting for a validation (oldest first), what is
/// late (most late first), the alerts not treated yet and who carries the load. Counts are exact; the lists are the top of each.
/// </summary>
[ApiController]
[Route("api/admin/pilotage")]
[Authorize(Roles = "admin,superadmin")]
public class PilotageController : ControllerBase
{
    private const int Top = 6;

    private static readonly string[] ClosedClaim = { "CLOTUREE", "CLOSED", "VALIDATED", "ARCHIVED", "DRAFT" };

    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;

    public PilotageController(IApplicationDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? organizationIds = null, [FromQuery] Guid? departmentId = null, CancellationToken ct = default)
    {
        var scope = await AdminScope.ResolveAsync(_db, organizationIds, departmentId, ct);
        var orgs = scope.Organizations;
        var scopeUsers = scope.Users;
        var claimsBase = await scope.ClaimsAsync(_db, ct);
        var plansBase = scope.Plans(_db);
        var alertsBase = _db.Alerts.AsNoTracking().AsQueryable();
        if (departmentId != null) alertsBase = alertsBase.Where(a => a.DepartmentId == departmentId);
        else if (orgs != null) alertsBase = alertsBase.Where(a => a.DepartmentId != null && _db.Departments.Any(d => d.Id == a.DepartmentId && orgs.Contains(d.OrganizationId)));

        var now = DateTime.UtcNow;
        var today = now.Date;
        int Days(DateTime from) => Math.Max(0, (int)(now - from).TotalDays);

        // Claims waiting for validation: oldest first.
        var pendingClaims = claimsBase.Where(c => c.StatusCode == "PENDING_VALIDATION");
        var pendingClaimCount = await pendingClaims.CountAsync(ct);
        var pendingClaimRows = (await pendingClaims
                .OrderBy(c => c.UpdatedAt ?? c.CreatedAt)
                .Take(Top)
                .Select(c => new { c.Id, c.Reference, c.Title, c.ProductionLine, c.AssignedToName, Since = c.UpdatedAt ?? c.CreatedAt })
                .ToListAsync(ct))
            .Select(c => new { c.Id, c.Reference, c.Title, Detail = c.ProductionLine, Who = c.AssignedToName, WaitingDays = Days(c.Since) })
            .ToList();

        // CAPA plans finished and waiting for validation: oldest first.
        var pendingPlans = plansBase.Where(p => p.Status == ActionPlanStatus.Ongoing && p.Progress == 100);
        var pendingPlanCount = await pendingPlans.CountAsync(ct);
        var pendingPlanRows = (await pendingPlans
                .OrderBy(p => p.UpdatedAt ?? p.CreatedAt)
                .Take(Top)
                .Select(p => new { p.Id, p.Reference, p.Title, p.AssignedToId, Since = p.UpdatedAt ?? p.CreatedAt })
                .ToListAsync(ct))
            .Select(p => new { p.Id, p.Reference, p.Title, Detail = (string?)null, Who = (string?)null, WaitingDays = Days(p.Since) })
            .ToList();

        // Late files, most late first.
        var lateClaims = claimsBase
            .Where(c => c.Deadline != null && c.Deadline < now && !ClosedClaim.Contains(c.StatusCode));
        var lateClaimCount = await lateClaims.CountAsync(ct);
        var lateClaimRows = (await lateClaims
                .OrderBy(c => c.Deadline)
                .Take(Top)
                .Select(c => new { c.Id, c.Reference, c.Title, c.AssignedToName, c.Deadline })
                .ToListAsync(ct))
            .Select(c => new { c.Id, c.Reference, c.Title, Who = c.AssignedToName, LateDays = Days(c.Deadline!.Value) })
            .ToList();

        // A plan is late by the rule shared with the dashboards: one of its unfinished sub-actions is past its deadline
        // (a plan without sub-actions: its own deadline).
        var latePlans = (await plansBase.Include(p => p.PlanActions).ToListAsync(ct))
            .Where(PlanDeadlines.IsOpen)
            .Where(p => PlanDeadlines.OverdueDays(p, today) > 0)
            .OrderByDescending(p => PlanDeadlines.OverdueDays(p, today))
            .ToList();
        var planIdsInScope = plansBase.Where(p => p.Status == ActionPlanStatus.Created || p.Status == ActionPlanStatus.Ongoing).Select(p => p.Id);
        var lateActionCount = await _db.PlanActions.AsNoTracking()
            .CountAsync(a => !a.IsArchived && a.Deadline != null && a.Deadline < now && (int)a.Progress < 100 && planIdsInScope.Contains(a.ActionPlanId), ct);

        // Alerts not treated yet, strongest first.
        var alerts = alertsBase.Where(a => a.Status.ToLower() == "pending_validation" || a.Status.ToLower() == "active");
        var alertCount = await alerts.CountAsync(ct);
        var alertRows = await alerts
            .OrderByDescending(a => a.ZScore)
            .Take(Top)
            .Select(a => new { a.Id, a.DefectType, a.ProductionLine, a.ZScore, a.DetectedAt })
            .ToListAsync(ct);

        // Who carries the load.
        var workload = await _mediator.Send(new GetCapaWorkloadQuery(orgs), ct);
        var inScope = workload.People.Where(p => scopeUsers == null || scopeUsers.Contains(p.UserId)).ToList();
        var withOpen = inScope.Where(p => p.OpenPlans > 0).ToList();
        var average = withOpen.Count == 0 ? 0 : Math.Round(withOpen.Average(p => (double)p.OpenPlans), 1);
        var overloaded = withOpen.Count(p => p.OpenPlans >= workload.Summary.OverloadMin && p.OpenPlans >= workload.Summary.OverloadFactor * average);
        var idle = inScope.Count(p => p.OpenPlans == 0 && p.ClosedPlans == 0 && p.OpenActions == 0 && p.ActionsToValidate == 0);
        var busiest = withOpen
            .OrderByDescending(p => p.OpenPlans).ThenByDescending(p => p.LatePlans)
            .Take(Top)
            .Select(p => new { p.UserId, p.Name, p.Department, p.OpenPlans, p.LatePlans, p.LateActions })
            .ToList();

        return Ok(new
        {
            generatedAt = now,
            validations = new
            {
                claims = new { count = pendingClaimCount, items = pendingClaimRows },
                plans = new { count = pendingPlanCount, items = pendingPlanRows },
            },
            late = new
            {
                claims = new { count = lateClaimCount, items = lateClaimRows },
                plans = new
                {
                    count = latePlans.Count,
                    items = latePlans.Take(Top).Select(p => new
                    {
                        p.Id, p.Reference, p.Title, Who = (string?)null, LateDays = PlanDeadlines.MaxLagDays(p, today),
                    }),
                },
                actions = lateActionCount,
            },
            alerts = new { count = alertCount, items = alertRows },
            load = new
            {
                people = withOpen.Count,
                average,
                overloaded,
                idle,
                busiest,
            },
        });
    }
}
