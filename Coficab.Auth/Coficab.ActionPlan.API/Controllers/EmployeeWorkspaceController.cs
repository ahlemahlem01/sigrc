using System.Security.Claims;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// Everything the employee dashboard needs in one request. It used to make ~4 + one 8D call per open
/// claim + one sub-action call per plan (up to ~74 requests), and the 8D calls created dossiers as a side effect.
/// </summary>
[ApiController]
[Route("api/employee/workspace")]
[Authorize]
public class EmployeeWorkspaceController : ControllerBase
{
    /// <summary>Same cap as the old per-claim 8D calls.</summary>
    private const int MaxEightDClaims = 30;

    private const int RecentCount = 3;

    private static readonly string[] ClosedClaimMarkers = { "CLOTUR", "CLOSED", "VALIDAT", "ARCHIV" };

    private readonly IMediator _mediator;
    private readonly IActionPlanService _actionPlans;
    private readonly IEightDService _eightD;
    private readonly IApplicationDbContext _db;

    public EmployeeWorkspaceController(
        IMediator mediator,
        IActionPlanService actionPlans,
        IEightDService eightD,
        IApplicationDbContext db)
    {
        _mediator = mediator;
        _actionPlans = actionPlans;
        _eightD = eightD;
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var (qualityAdmin, superAdmin) = Roles();

        // Same scope as GET api/QualityAnalysis/claims?assignedTo=me.
        var claims = await _mediator.Send(
            qualityAdmin
                ? new GetClaimsQuery(null, userId, null, null, null, false, superAdmin ? null : userId)
                : new GetClaimsQuery(null, userId, null, null, null, true, null),
            ct);

        // Same list as GET api/actionplan/user/assigned.
        var plans = (await _actionPlans.GetUserAssignedPlansAsync(userId)).ToList();
        var planIds = plans.Select(p => Guid.TryParse(p.Id, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .ToList();

        var planActions = await _db.PlanActions
            .AsNoTracking()
            .Where(a => planIds.Contains(a.ActionPlanId) && !a.IsArchived)
            .Select(a => new { a.Id, a.ActionPlanId, Progress = (int)a.Progress, a.Deadline })
            .ToListAsync(ct);

        var eightD = new List<object>();
        foreach (var claim in claims.Where(IsOpen).Take(MaxEightDClaims))
        {
            var dossier = await _eightD.PeekAsync(claim.Id, ct);
            if (dossier == null) continue;
            eightD.Add(new
            {
                dossier.ClaimId,
                dossier.ClaimTitle,
                dossier.StatusCode,
                Steps = dossier.Steps.Select(s => new { s.Step, s.Code, s.Label, s.Unlocked, s.Complete }),
            });
        }

        var rejectedPlans = await _actionPlans.GetRejectedAsync(userId, qualityAdmin, superAdmin);

        // Latest documents and badges added by an admin to the employee's file.
        var recentDocuments = await _db.Documents
            .AsNoTracking()
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.CreatedAt)
            .Take(RecentCount)
            .Select(d => new { d.Id, d.Name, d.Type, d.CreatedAt })
            .ToListAsync(ct);

        var recentBadges = await _db.Badges
            .AsNoTracking()
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.EarnedAt)
            .Take(RecentCount)
            .Select(b => new { b.Id, b.Name, b.Description, b.Color, b.Category, b.EarnedAt })
            .ToListAsync(ct);

        return Ok(new { claims, plans, planActions, eightD, rejectedPlans, recentDocuments, recentBadges });
    }

    private static bool IsOpen(Core.Entities.Claim claim)
    {
        var status = (claim.StatusCode ?? string.Empty).ToUpperInvariant();
        return !ClosedClaimMarkers.Any(status.Contains);
    }

    private (bool QualityAdmin, bool SuperAdmin) Roles()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .ToHashSet();
        var super = roles.Contains("superadmin");
        return (super || roles.Contains("admin") || roles.Contains("admin_quality"), super);
    }
}
