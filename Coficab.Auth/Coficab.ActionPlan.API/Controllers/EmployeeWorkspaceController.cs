using System.Security.Claims;
using Coficab.ActionPlan.Application.Dashboard;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

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
    private readonly IConfiguration _configuration;

    public EmployeeWorkspaceController(
        IMediator mediator,
        IActionPlanService actionPlans,
        IEightDService eightD,
        IApplicationDbContext db,
        IConfiguration configuration)
    {
        _mediator = mediator;
        _actionPlans = actionPlans;
        _eightD = eightD;
        _db = db;
        _configuration = configuration;
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

        var recentBadges = Coficab.ActionPlan.Application.Badges.BadgeDuplicates.Distinct(await _db.Badges
                .AsNoTracking()
                .Where(b => b.UserId == userId)
                .ToListAsync(ct))
            .Take(RecentCount)
            .Select(b => new { b.Id, b.Name, b.Description, b.Color, b.Category, b.EarnedAt })
            .ToList();

        return Ok(new { claims, plans, planActions, eightD, rejectedPlans, recentDocuments, recentBadges });
    }

    /// <summary>
    /// The employee's load against the team's, anonymous: only the caller's own numbers and the team average are returned.
    /// Administrators and deactivated accounts are not part of the team (same rule as the workload view of the admins).
    /// </summary>
    [HttpGet("workload")]
    public async Task<IActionResult> Workload(CancellationToken ct)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var (_, _, overloadMin, overloadFactor) = await ThresholdsStore.LoadCoreAsync(_db, ct);

        var staff = (await _db.UserProfiles.AsNoTracking()
                .Select(u => new { u.UserId, u.Role, u.Status })
                .ToListAsync(ct))
            .Where(u => !string.Equals(u.Status, "inactive", StringComparison.OrdinalIgnoreCase)
                        && !(u.Role ?? string.Empty).Contains("admin", StringComparison.OrdinalIgnoreCase))
            .Select(u => u.UserId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var today = DateTime.UtcNow.Date;
        var plans = (await _db.ActionPlans.AsNoTracking()
                .Where(p => !p.IsArchived && p.AssignedToId != null)
                .ToListAsync(ct))
            .Where(PlanDeadlines.IsOpen)
            .ToList();
        var claims = (await _db.Claims.AsNoTracking()
                .Where(c => !c.IsArchived && c.AssignedToId != null)
                .Select(c => new { c.AssignedToId, c.StatusCode })
                .ToListAsync(ct))
            .Where(c => !ClosedClaimMarkers.Any((c.StatusCode ?? string.Empty).ToUpperInvariant().Contains))
            .ToList();

        // Open files per person: plans + claims, only for the team.
        var perPerson = staff.ToDictionary(id => id, _ => 0, StringComparer.OrdinalIgnoreCase);
        foreach (var p in plans) if (perPerson.ContainsKey(p.AssignedToId!)) perPerson[p.AssignedToId!]++;
        foreach (var c in claims) if (perPerson.ContainsKey(c.AssignedToId!)) perPerson[c.AssignedToId!]++;

        var active = perPerson.Values.Where(v => v > 0).ToList();
        var average = active.Count == 0 ? 0 : Math.Round(active.Average(), 1);
        var minePlans = plans.Count(p => string.Equals(p.AssignedToId, userId, StringComparison.OrdinalIgnoreCase));
        var mineClaims = claims.Count(c => string.Equals(c.AssignedToId, userId, StringComparison.OrdinalIgnoreCase));
        var mine = minePlans + mineClaims;
        var latePlans = plans.Count(p => string.Equals(p.AssignedToId, userId, StringComparison.OrdinalIgnoreCase) && PlanDeadlines.OverdueDays(p, today) > 0);
        var teamPlansAvg = active.Count == 0 ? 0 : Math.Round(plans.Count(p => perPerson.ContainsKey(p.AssignedToId!)) / (double)active.Count, 1);

        var state = average <= 0 || mine == 0 ? "none"
            : mine >= overloadMin && mine >= overloadFactor * average ? "high"
            : mine < average * 0.6 ? "light"
            : "normal";

        return Ok(new
        {
            mine,
            minePlans,
            mineClaims,
            latePlans,
            teamAverage = average,
            teamPlansAverage = teamPlansAvg,
            teamSize = active.Count,
            overloadMin,
            overloadFactor,
            state,
        });
    }

    /// <summary>
    /// My activity over the last 12 weeks against the team's (anonymous): closed claims and open claims at the end of each
    /// week (mine / average per person of the team), plus the closing time and on-time rate over the last 90 days.
    /// </summary>
    [HttpGet("activity")]
    public async Task<IActionResult> Activity(CancellationToken ct)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        const int weeks = 12;
        var targets = await OverviewTargetsStore.LoadAsync(_db, _configuration, ct);
        var staff = (await _db.UserProfiles.AsNoTracking().Select(u => new { u.UserId, u.Role, u.Status }).ToListAsync(ct))
            .Where(u => !string.Equals(u.Status, "inactive", StringComparison.OrdinalIgnoreCase)
                        && !(u.Role ?? string.Empty).Contains("admin", StringComparison.OrdinalIgnoreCase))
            .Select(u => u.UserId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var rows = await _db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.AssignedToId != null)
            .Select(c => new ClaimRow(c.AssignedToId, c.AssignedAt, c.CreatedAt, c.CompletedAt, c.IsOnTime))
            .ToListAsync(ct);
        var team = rows.Where(r => staff.Contains(r.AssignedToId!)).ToList();
        var teamPeople = team.Select(r => r.AssignedToId!).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        bool Mine(string? id) => string.Equals(id, userId, StringComparison.OrdinalIgnoreCase);
        DateTime Start(DateTime? assignedAt, DateTime createdAt) => assignedAt ?? createdAt;

        var today = DateTime.UtcNow.Date;
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var series = new List<object>();
        for (var i = weeks - 1; i >= 0; i--)
        {
            var from = monday.AddDays(-7 * i);
            var to = from.AddDays(7);
            int Closed(IReadOnlyCollection<ClaimRow> src) => src.Count(r => r.CompletedAt != null && r.CompletedAt >= from && r.CompletedAt < to);
            int Open(IReadOnlyCollection<ClaimRow> src) => src.Count(r => Start(r.AssignedAt, r.CreatedAt) < to && (r.CompletedAt == null || r.CompletedAt >= to));
            var mineRows = rows.Where(r => Mine(r.AssignedToId)).ToList();
            var teamRows = team.ToList();
            series.Add(new
            {
                weekStart = from,
                closed = Closed(mineRows),
                open = Open(mineRows),
                teamClosed = teamPeople == 0 ? 0 : Math.Round(Closed(teamRows) / (double)teamPeople, 1),
                teamOpen = teamPeople == 0 ? 0 : Math.Round(Open(teamRows) / (double)teamPeople, 1),
            });
        }

        var since = today.AddDays(-90);
        (double? Days, double? OnTime, int Count) Stats(IReadOnlyCollection<ClaimRow> src)
        {
            var done = src.Where(r => r.CompletedAt != null && r.CompletedAt >= since).ToList();
            if (done.Count == 0) return (null, null, 0);
            var days = done.Average(r => Math.Max(0, (r.CompletedAt!.Value - Start(r.AssignedAt, r.CreatedAt)).TotalDays));
            var judged = done.Where(r => r.IsOnTime != null).ToList();
            double? onTime = judged.Count == 0 ? null : Math.Round(100.0 * judged.Count(r => r.IsOnTime == true) / judged.Count);
            return (Math.Round(days, 1), onTime, done.Count);
        }
        var m = Stats(rows.Where(r => Mine(r.AssignedToId)).ToList());
        var tm = Stats(team.ToList());

        return Ok(new
        {
            weeks = series,
            target = new { resolutionDays = targets.ResolutionDays, onTimeGreen = targets.OnTimeGreen },
            mine = new { avgDays = m.Days, onTimeRate = m.OnTime, closed90 = m.Count },
            team = new { avgDays = tm.Days, onTimeRate = tm.OnTime, closed90PerPerson = teamPeople == 0 ? 0 : Math.Round(tm.Count / (double)teamPeople, 1), size = teamPeople },
        });
    }

    private sealed record ClaimRow(string? AssignedToId, DateTime? AssignedAt, DateTime CreatedAt, DateTime? CompletedAt, bool? IsOnTime);

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
