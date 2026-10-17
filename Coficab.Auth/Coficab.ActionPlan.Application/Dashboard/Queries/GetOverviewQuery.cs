using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.ReferenceLists;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Coficab.ActionPlan.Application.Dashboard.Queries;

/// <summary>Levels the traffic lights of the overview are compared with (configurable, see Overview:* in the settings).</summary>
public record OverviewTargetsDto(double OnTimeGreen, double OnTimeOrange, double ResolutionDays, double PpmTolerancePct);

/// <summary>A figure for the chosen period and the same figure for the period just before it.</summary>
public record OverviewMetricDto(double? Value, double? Previous);

public record OverviewHeadlineDto(
    int OpenClaims,
    int ClosedInPeriod,
    OverviewMetricDto OnTimeRate,
    int OnTimeCount,
    int OnTimeBase,
    OverviewMetricDto AvgResolutionDays,
    OverviewMetricDto Ppm,
    int PpmClaims,
    int LatePlans,
    double PlansClosureRate);

public record OverviewAlertDto(Guid Id, string DefectType, string ProductionLine, double ZScore, int CurrentCount, DateTime DetectedAt);

public record OverviewActionsDto(
    int PendingValidation,
    int Unassigned,
    int LateClaims,
    int NoDeadline,
    int LatePlans,
    int OpenAlerts,
    IReadOnlyList<OverviewAlertDto> Alerts);

public record RankedItemDto(string Name, int Count, double SharePct);

public record RisingDefectDto(string DefectType, int Recent, int Previous);

public record OverviewProblemsDto(
    int ClaimsInPeriod,
    IReadOnlyList<RankedItemDto> TopDefects,
    IReadOnlyList<RankedItemDto> TopLines,
    IReadOnlyList<RankedItemDto> TopClients,
    IReadOnlyList<RisingDefectDto> Rising);

public record OverviewMonthDto(string Month, int Opened, int Closed, int OnTime, double? OnTimeRate);

public record OverviewHealthDto(
    DateTime? LastImportAt,
    string? LastImportName,
    bool SimulatedData,
    int ProfilesWithoutDepartment);

public record OverviewDto(
    int Days,
    DateTime GeneratedAt,
    OverviewTargetsDto Targets,
    OverviewHeadlineDto Headline,
    OverviewActionsDto Actions,
    OverviewProblemsDto Problems,
    IReadOnlyList<OverviewMonthDto> Months,
    OverviewHealthDto Health);

public record GetOverviewQuery(int Days = 90, string? UserId = null, bool SuperAdmin = true) : IRequest<OverviewDto>;

/// <summary>
/// The management overview. Late, no-deadline and plan figures come from the dashboard summary so both pages always agree;
/// the rest (on-time rate, resolution time, PPM, validation queue, rankings, trend, data health) is computed here.
/// </summary>
public class GetOverviewQueryHandler : IRequestHandler<GetOverviewQuery, OverviewDto>
{
    /// <summary>A defect is "rising" when it has at least this many claims in the period and 1.5x the previous period.</summary>
    private const int RisingMinClaims = 5;
    private const double RisingFactor = 1.5;
    private const int MaxDays = 366;

    private readonly IApplicationDbContext _context;
    private readonly IMediator _mediator;
    private readonly IConfiguration _configuration;

    public GetOverviewQueryHandler(IApplicationDbContext context, IMediator mediator, IConfiguration configuration)
    {
        _context = context;
        _mediator = mediator;
        _configuration = configuration;
    }

    private double Target(string key, double fallback) =>
        double.TryParse(_configuration[key], System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : fallback;

    public async Task<OverviewDto> Handle(GetOverviewQuery request, CancellationToken ct)
    {
        var days = Math.Clamp(request.Days, 7, MaxDays);
        var now = DateTime.UtcNow;
        var today = now.Date;
        var start = today.AddDays(-days);
        var prevStart = start.AddDays(-days);

        var summary = await _mediator.Send(new GetDashboardSummaryQuery(request.UserId, request.SuperAdmin), ct);
        var defectTypes = await DefectTypeResolver.LoadAsync(_context, ct);

        var all = await _context.Claims.AsNoTracking()
            .Where(c => !c.IsArchived)
            .Select(c => new
            {
                c.Id,
                c.ClientId,
                c.DefectType,
                c.ProductionLine,
                c.StatusCode,
                c.DetectionDate,
                c.CreatedAt,
                c.CompletedAt,
                c.IsOnTime,
                c.AssignedToId,
                c.CreatedById,
                c.ProducedQuantity,
                c.DefectiveQuantity,
            })
            .ToListAsync(ct);

        if (!request.SuperAdmin && !string.IsNullOrWhiteSpace(request.UserId))
        {
            // same visibility as the dashboard summary: own claims and the department's
            var uid = request.UserId.Trim();
            var me = await _context.UserProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == uid, ct);
            var deptUsers = me?.DepartmentId == null
                ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                : (await _context.UserProfiles.AsNoTracking()
                    .Where(p => p.DepartmentId == me.DepartmentId).Select(p => p.UserId).ToListAsync(ct))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
            all = all.Where(c =>
                string.Equals(c.CreatedById, uid, StringComparison.OrdinalIgnoreCase)
                || string.Equals(c.AssignedToId, uid, StringComparison.OrdinalIgnoreCase)
                || (c.CreatedById != null && deptUsers.Contains(c.CreatedById))
                || (c.AssignedToId != null && deptUsers.Contains(c.AssignedToId))).ToList();
        }

        static bool IsClosed(string s) =>
            string.Equals(s, "CLOTUREE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(s, "CLOSED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(s, "CLOTURE", StringComparison.OrdinalIgnoreCase);
        static bool IsDraft(string s) =>
            string.Equals(s, "DRAFT", StringComparison.OrdinalIgnoreCase)
            || string.Equals(s, "BROUILLON", StringComparison.OrdinalIgnoreCase);

        var live = all.Where(c => !IsDraft(c.StatusCode)).ToList();
        var open = live.Where(c => !IsClosed(c.StatusCode)).ToList();

        // ── headline ──
        (int Closed, int OnTimeBase, int OnTime, double? AvgDays) Closures(DateTime from, DateTime to)
        {
            var closed = live.Where(c => c.CompletedAt != null && c.CompletedAt >= from && c.CompletedAt < to).ToList();
            var judged = closed.Where(c => c.IsOnTime != null).ToList();
            double? avg = closed.Count == 0
                ? null
                : Math.Round(closed.Average(c => Math.Max(0, (c.CompletedAt!.Value - c.CreatedAt).TotalDays)), 1);
            return (closed.Count, judged.Count, judged.Count(c => c.IsOnTime == true), avg);
        }

        (double? Ppm, int Claims) PpmBetween(DateTime from, DateTime to)
        {
            var rows = live.Where(c => c.DetectionDate >= from && c.DetectionDate < to
                                       && c.ProducedQuantity is > 0 && c.DefectiveQuantity != null).ToList();
            var produced = rows.Sum(c => (double)c.ProducedQuantity!.Value);
            return produced <= 0
                ? (null, 0)
                : (Math.Round(1_000_000.0 * rows.Sum(c => (double)c.DefectiveQuantity!.Value) / produced), rows.Count);
        }

        var cur = Closures(start, today.AddDays(1));
        var prev = Closures(prevStart, start);
        double? Rate(int ok, int total) => total == 0 ? null : Math.Round(100.0 * ok / total, 1);
        var ppmCur = PpmBetween(start, today.AddDays(1));
        var ppmPrev = PpmBetween(prevStart, start);

        var headline = new OverviewHeadlineDto(
            summary.Claims.Kpis.TotalOpen,
            cur.Closed,
            new OverviewMetricDto(Rate(cur.OnTime, cur.OnTimeBase), Rate(prev.OnTime, prev.OnTimeBase)),
            cur.OnTime,
            cur.OnTimeBase,
            new OverviewMetricDto(cur.AvgDays, prev.AvgDays),
            new OverviewMetricDto(ppmCur.Ppm, ppmPrev.Ppm),
            ppmCur.Claims,
            summary.ActionPlans.Kpis.Late,
            summary.ActionPlans.Kpis.ClosureRate);

        // ── actions ──
        var openAlerts = await _context.Alerts.AsNoTracking()
            .Where(a => a.ArchivedAt == null
                        && (a.Status.ToLower() == "pending_validation" || a.Status.ToLower() == "active"))
            .OrderByDescending(a => a.DetectedAt)
            .ToListAsync(ct);

        var actions = new OverviewActionsDto(
            live.Count(c => string.Equals(c.StatusCode, "PENDING_VALIDATION", StringComparison.OrdinalIgnoreCase)),
            open.Count(c => string.IsNullOrWhiteSpace(c.AssignedToId)),
            summary.Claims.Kpis.Late,
            summary.Claims.Kpis.NoDeadline,
            summary.ActionPlans.Kpis.Late,
            openAlerts.Count,
            openAlerts.Take(3)
                .Select(a => new OverviewAlertDto(a.Id, a.DefectType, a.ProductionLine, Math.Round(a.ZScore, 1), a.CurrentCount, a.DetectedAt))
                .ToList());

        // ── problems ──
        var inPeriod = live.Where(c => c.DetectionDate >= start && c.DetectionDate < today.AddDays(1)).ToList();
        var inPrev = live.Where(c => c.DetectionDate >= prevStart && c.DetectionDate < start).ToList();

        List<RankedItemDto> Top(IEnumerable<string?> names)
        {
            var list = names.Select(n => string.IsNullOrWhiteSpace(n) ? null : n.Trim()).Where(n => n != null).Select(n => n!).ToList();
            return list.GroupBy(n => n)
                .OrderByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .Take(5)
                .Select(g => new RankedItemDto(g.Key, g.Count(), list.Count == 0 ? 0 : Math.Round(100.0 * g.Count() / list.Count, 1)))
                .ToList();
        }

        string Defect(string raw) => defectTypes.Resolve(raw);
        var recentByDefect = inPeriod.GroupBy(c => Defect(c.DefectType)).ToDictionary(g => g.Key, g => g.Count());
        var prevByDefect = inPrev.GroupBy(c => Defect(c.DefectType)).ToDictionary(g => g.Key, g => g.Count());
        var rising = recentByDefect
            .Where(kv => defectTypes.IsKnown(kv.Key) && kv.Value >= RisingMinClaims && kv.Value >= RisingFactor * Math.Max(1, prevByDefect.GetValueOrDefault(kv.Key)))
            .OrderByDescending(kv => (double)kv.Value / Math.Max(1, prevByDefect.GetValueOrDefault(kv.Key)))
            .Take(3)
            .Select(kv => new RisingDefectDto(kv.Key, kv.Value, prevByDefect.GetValueOrDefault(kv.Key)))
            .ToList();

        var problems = new OverviewProblemsDto(
            inPeriod.Count,
            Top(inPeriod.Select(c => Defect(c.DefectType))),
            Top(inPeriod.Select(c => c.ProductionLine)),
            Top(inPeriod.Select(c => c.ClientId)),
            rising);

        // ── trend: the last 6 months ──
        var months = Enumerable.Range(0, 6).Select(i => new DateTime(now.Year, now.Month, 1).AddMonths(-5 + i)).ToList();
        var monthly = months.Select(m =>
        {
            var next = m.AddMonths(1);
            var closed = live.Where(c => c.CompletedAt != null && c.CompletedAt >= m && c.CompletedAt < next).ToList();
            var judged = closed.Where(c => c.IsOnTime != null).ToList();
            var ok = judged.Count(c => c.IsOnTime == true);
            return new OverviewMonthDto(
                m.ToString("yyyy-MM"),
                live.Count(c => c.CreatedAt >= m && c.CreatedAt < next),
                closed.Count,
                ok,
                Rate(ok, judged.Count));
        }).ToList();

        // ── health of the data and of the tool ──
        var batches = await _context.ImportBatches.AsNoTracking().Where(b => !b.IsArchived).ToListAsync(ct);
        var lastImport = batches.OrderByDescending(b => b.CreatedAt).FirstOrDefault();
        var withoutDepartment = await _context.UserProfiles.AsNoTracking().CountAsync(p => p.DepartmentId == null, ct);
        var health = new OverviewHealthDto(
            lastImport?.CreatedAt,
            lastImport?.FileName,
            batches.Any(b => b.FileName.StartsWith("SIMULATION", StringComparison.OrdinalIgnoreCase)),
            withoutDepartment);

        var targets = new OverviewTargetsDto(
            Target("Overview:OnTimeGreen", 85),
            Target("Overview:OnTimeOrange", 70),
            Target("Overview:ResolutionDays", 14),
            Target("Overview:PpmTolerancePct", 10));

        return new OverviewDto(days, now, targets, headline, actions, problems, monthly, health);
    }
}
