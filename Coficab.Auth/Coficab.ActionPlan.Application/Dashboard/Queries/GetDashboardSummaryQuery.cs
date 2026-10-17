using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Dashboard.Queries;

public record NamedCountDto(string Name, int Count);

public record MonthlyOpenClosedDto(string Month, int Opened, int Closed);

public record NoDeadlineClaimItemDto(
    Guid Id,
    string Title,
    string ClientId,
    string Severity,
    int AgeDays,
    string? ResponsibleId,
    string? ResponsibleName
);

public record LateClaimItemDto(
    Guid Id,
    string Title,
    string ClientId,
    string Severity,
    int OverdueDays,
    string? ResponsibleId,
    string? ResponsibleName
);

public record LateActionPlanItemDto(
    Guid Id,
    string Title,
    string Nature,
    int OverdueDays,
    string? ResponsibleId,
    string? ResponsibleName,
    DateTime? Deadline
);

public record ResponsibleItemDto(
    string UserId,
    string Name,
    string Department,
    string? AvatarUrl,
    int Total,
    int Closed,
    double ClosureRate
);

public record StreamKpisDto(
    int TotalOpen,
    int Late,
    double ClosureRate,
    int Critical,
    int NoDeadline = 0
);

public record ClaimsDashboardDto(
    StreamKpisDto Kpis,
    IReadOnlyList<LateClaimItemDto> Top5Late,
    IReadOnlyList<MonthlyOpenClosedDto> MonthlyOpenClosed,
    IReadOnlyList<NamedCountDto> SeverityDonut,
    IReadOnlyList<ResponsibleItemDto> TopResponsibles,
    IReadOnlyList<NoDeadlineClaimItemDto> Top5NoDeadline
);

public record ActionPlansDashboardDto(
    StreamKpisDto Kpis,
    IReadOnlyList<LateActionPlanItemDto> Top5Late,
    IReadOnlyList<MonthlyOpenClosedDto> MonthlyOpenClosed,
    IReadOnlyList<NamedCountDto> NatureDonut,
    IReadOnlyList<ResponsibleItemDto> TopResponsibles
);

public record GlobalDashboardKpisDto(
    int TotalActiveDossiers,
    int TotalOverdue,
    double GlobalClosureRate,
    int CriticalAlerts
);

public record DashboardSummaryDto(
    GlobalDashboardKpisDto Global,
    ClaimsDashboardDto Claims,
    ActionPlansDashboardDto ActionPlans
);

public record GetDashboardSummaryQuery(string? UserId = null, bool SuperAdmin = true, Guid? OrganizationId = null) : IRequest<DashboardSummaryDto>;

public class GetDashboardSummaryQueryHandler : IRequestHandler<GetDashboardSummaryQuery, DashboardSummaryDto>
{
    private readonly IApplicationDbContext _context;

    public GetDashboardSummaryQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<DashboardSummaryDto> Handle(GetDashboardSummaryQuery request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var today = now.Date;
        var months = Enumerable.Range(0, 6)
            .Select(i => new DateTime(now.Year, now.Month, 1).AddMonths(-5 + i))
            .ToList();

        var claims = await _context.Claims
            .AsNoTracking()
            .Where(c => !c.IsArchived)
            .Select(c => new
            {
                c.Id,
                c.Title,
                c.ClientId,
                c.Severity,
                c.StatusCode,
                c.DetectionDate,
                c.Deadline,
                c.CreatedAt,
                c.UpdatedAt,
                c.CreatedById,
                c.AssignedToId,
                c.CreatedBy,
            })
            .ToListAsync(cancellationToken);

        var plans = await _context.ActionPlans
            .AsNoTracking()
            .Include(p => p.PlanActions)
            .Include(p => p.Department)
            .Where(p => !p.IsArchived)
            .ToListAsync(cancellationToken);

        var profiles = await _context.UserProfiles
            .AsNoTracking()
            .Include(u => u.Department)
            .ToListAsync(cancellationToken);
        var profileByUserId = profiles
            .GroupBy(p => p.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        if (!request.SuperAdmin && !string.IsNullOrWhiteSpace(request.UserId))
        {
            var uid = request.UserId.Trim();
            profileByUserId.TryGetValue(uid, out var me);
            var deptId = me?.DepartmentId;
            var deptUsers = profiles
                .Where(p => deptId != null && p.DepartmentId == deptId)
                .Select(p => p.UserId)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var planClaimIds = plans
                .Where(p => deptId != null && p.DepartmentId == deptId && p.ClaimId != null)
                .Select(p => p.ClaimId!.Value)
                .ToHashSet();
            claims = claims.Where(c =>
                string.Equals(c.CreatedById, uid, StringComparison.OrdinalIgnoreCase)
                || string.Equals(c.AssignedToId, uid, StringComparison.OrdinalIgnoreCase)
                || (c.CreatedById != null && deptUsers.Contains(c.CreatedById))
                || (c.AssignedToId != null && deptUsers.Contains(c.AssignedToId))
                || planClaimIds.Contains(c.Id)).ToList();
        }

        if (request.OrganizationId is { } orgFilter)
        {
            var attribution = await OrganizationAttribution.LoadAsync(_context, cancellationToken);
            claims = claims.Where(c => attribution.Of(c.AssignedToId, c.CreatedById) == orgFilter).ToList();
            plans = plans.Where(p => p.OrganizationId == orgFilter).ToList();
        }

        static bool IsClaimClosed(string status) =>
            string.Equals(status, "CLOTUREE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "CLOSED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "CLOTURE", StringComparison.OrdinalIgnoreCase);

        static bool IsClaimDraft(string status) =>
            string.Equals(status, "DRAFT", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "BROUILLON", StringComparison.OrdinalIgnoreCase);

        static bool IsClaimCritical(string severity) =>
            string.Equals(severity, "CRITICAL", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "CRITIQUE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "HIGH", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "ELEVEE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "ÉLEVÉE", StringComparison.OrdinalIgnoreCase);

        int PlanOverdueDays(Core.Entities.ActionPlan plan) => PlanDeadlines.OverdueDays(plan, today);

        string ResolveName(string? userId, string? fallback = null)
        {
            if (!string.IsNullOrWhiteSpace(userId) && profileByUserId.TryGetValue(userId, out var p))
                return string.IsNullOrWhiteSpace(p.Name) ? (p.Email ?? userId) : p.Name;
            return string.IsNullOrWhiteSpace(fallback) ? (userId ?? "—") : fallback!;
        }

        string ResolveDept(string? userId)
        {
            if (!string.IsNullOrWhiteSpace(userId) && profileByUserId.TryGetValue(userId, out var p))
                return ClaimVisibility.DepartmentLabel(p.Department);
            return "—";
        }

        string? ResolveAvatar(string? userId)
        {
            if (!string.IsNullOrWhiteSpace(userId) && profileByUserId.TryGetValue(userId, out var p))
                return p.ProfilePictureUrl;
            return null;
        }

        // ── Claims ──
        var openClaims = claims.Where(c => !IsClaimClosed(c.StatusCode) && !IsClaimDraft(c.StatusCode)).ToList();
        var closedClaims = claims.Where(c => IsClaimClosed(c.StatusCode)).ToList();
        // late = open and past its deadline; a claim without a deadline is reported separately, never as late
        var lateClaims = openClaims
            .Where(c => ClaimDeadlines.IsLate(c.Deadline, today))
            .Select(c => new { Claim = c, OverdueDays = ClaimDeadlines.OverdueDays(c.Deadline, today) })
            .OrderByDescending(x => x.OverdueDays)
            .ToList();
        var noDeadlineClaims = openClaims
            .Where(c => ClaimDeadlines.HasNoDeadline(c.Deadline))
            .OrderBy(c => c.DetectionDate == default ? c.CreatedAt : c.DetectionDate)
            .ToList();

        var claimCritical = openClaims.Count(c => IsClaimCritical(c.Severity));
        var claimDenom = openClaims.Count + closedClaims.Count;
        var claimClosure = claimDenom == 0 ? 0 : Math.Round(100.0 * closedClaims.Count / claimDenom, 1);

        var claimTop5 = lateClaims.Take(5).Select(x => new LateClaimItemDto(
            x.Claim.Id,
            x.Claim.Title,
            x.Claim.ClientId,
            string.IsNullOrWhiteSpace(x.Claim.Severity) ? "MEDIUM" : x.Claim.Severity,
            x.OverdueDays,
            x.Claim.AssignedToId ?? x.Claim.CreatedById,
            ResolveName(x.Claim.AssignedToId ?? x.Claim.CreatedById, x.Claim.CreatedBy)
        )).ToList();

        var claimNoDeadlineTop5 = noDeadlineClaims.Take(5).Select(c => new NoDeadlineClaimItemDto(
            c.Id,
            c.Title,
            c.ClientId,
            string.IsNullOrWhiteSpace(c.Severity) ? "MEDIUM" : c.Severity,
            Math.Max(0, (today - (c.DetectionDate == default ? c.CreatedAt : c.DetectionDate).Date).Days),
            c.AssignedToId ?? c.CreatedById,
            ResolveName(c.AssignedToId ?? c.CreatedById, c.CreatedBy)
        )).ToList();

        var claimMonthly = months.Select(m =>
        {
            var next = m.AddMonths(1);
            var opened = claims.Count(c => c.CreatedAt >= m && c.CreatedAt < next);
            var closed = closedClaims.Count(c =>
            {
                var when = c.UpdatedAt ?? c.CreatedAt;
                return when >= m && when < next;
            });
            return new MonthlyOpenClosedDto(m.ToString("yyyy-MM"), opened, closed);
        }).ToList();

        var severityDonut = claims
            .GroupBy(c => string.IsNullOrWhiteSpace(c.Severity) ? "UNKNOWN" : c.Severity.ToUpperInvariant())
            .Select(g => new NamedCountDto(g.Key, g.Count()))
            .OrderByDescending(x => x.Count)
            .ToList();

        var claimResponsibles = claims
            .Select(c => new { Claim = c, UserId = c.AssignedToId ?? c.CreatedById })
            .Where(x => !string.IsNullOrWhiteSpace(x.UserId))
            .GroupBy(x => x.UserId!)
            .Select(g =>
            {
                var total = g.Count();
                var closed = g.Count(x => IsClaimClosed(x.Claim.StatusCode));
                return new ResponsibleItemDto(
                    g.Key,
                    ResolveName(g.Key, g.First().Claim.CreatedBy),
                    ResolveDept(g.Key),
                    ResolveAvatar(g.Key),
                    total,
                    closed,
                    total == 0 ? 0 : Math.Round(100.0 * closed / total, 1)
                );
            })
            .OrderByDescending(r => r.Total)
            .Take(8)
            .ToList();

        // ── Action plans ──
        var openPlans = plans.Where(p => p.Status is ActionPlanStatus.Created or ActionPlanStatus.Ongoing).ToList();
        var closedPlans = plans.Where(p => p.Status == ActionPlanStatus.Closed).ToList();
        var planWithOverdue = openPlans
            .Select(p => new { Plan = p, OverdueDays = PlanOverdueDays(p) })
            .Where(x => x.OverdueDays > 0)
            .OrderByDescending(x => x.OverdueDays)
            .ToList();

        var planCritical = planWithOverdue.Count(x => x.OverdueDays >= 7);
        var planDenom = openPlans.Count + closedPlans.Count;
        var planClosure = planDenom == 0 ? 0 : Math.Round(100.0 * closedPlans.Count / planDenom, 1);

        static string NatureLabel(ActionPlanType t) => t switch
        {
            ActionPlanType.PA => "PA",
            ActionPlanType.PAC => "PAC",
            ActionPlanType.PAP => "PAP",
            _ => t.ToString(),
        };

        var planTop5 = planWithOverdue.Take(5).Select(x => new LateActionPlanItemDto(
            x.Plan.Id,
            x.Plan.Title,
            NatureLabel(x.Plan.Type),
            x.OverdueDays,
            x.Plan.AssignedToId ?? x.Plan.OwnerId,
            ResolveName(x.Plan.AssignedToId ?? x.Plan.OwnerId),
            x.Plan.Deadline
        )).ToList();

        var planMonthly = months.Select(m =>
        {
            var next = m.AddMonths(1);
            var opened = plans.Count(p => p.CreatedAt >= m && p.CreatedAt < next);
            var closed = closedPlans.Count(p =>
            {
                var when = p.UpdatedAt ?? p.CreatedAt;
                return when >= m && when < next;
            });
            return new MonthlyOpenClosedDto(m.ToString("yyyy-MM"), opened, closed);
        }).ToList();

        var natureDonut = plans
            .GroupBy(p => NatureLabel(p.Type))
            .Select(g => new NamedCountDto(g.Key, g.Count()))
            .OrderByDescending(x => x.Count)
            .ToList();

        var planResponsibles = plans
            .Select(p => new { Plan = p, UserId = p.AssignedToId ?? p.OwnerId })
            .Where(x => !string.IsNullOrWhiteSpace(x.UserId))
            .GroupBy(x => x.UserId!)
            .Select(g =>
            {
                var total = g.Count();
                var closed = g.Count(x => x.Plan.Status == ActionPlanStatus.Closed);
                return new ResponsibleItemDto(
                    g.Key,
                    ResolveName(g.Key),
                    ResolveDept(g.Key) != "—"
                        ? ResolveDept(g.Key)
                        : (g.First().Plan.Department?.Name ?? "—"),
                    ResolveAvatar(g.Key),
                    total,
                    closed,
                    total == 0 ? 0 : Math.Round(100.0 * closed / total, 1)
                );
            })
            .OrderByDescending(r => r.Total)
            .Take(8)
            .ToList();

        // ── Global ──
        var totalActive = openClaims.Count + openPlans.Count;
        var totalOverdue = lateClaims.Count + planWithOverdue.Count;
        var globalDenom = claimDenom + planDenom;
        var globalClosed = closedClaims.Count + closedPlans.Count;
        var globalClosure = globalDenom == 0 ? 0 : Math.Round(100.0 * globalClosed / globalDenom, 1);
        var criticalAlerts = claimCritical + planCritical;

        return new DashboardSummaryDto(
            new GlobalDashboardKpisDto(totalActive, totalOverdue, globalClosure, criticalAlerts),
            new ClaimsDashboardDto(
                new StreamKpisDto(openClaims.Count, lateClaims.Count, claimClosure, claimCritical, noDeadlineClaims.Count),
                claimTop5,
                claimMonthly,
                severityDonut,
                claimResponsibles,
                claimNoDeadlineTop5
            ),
            new ActionPlansDashboardDto(
                new StreamKpisDto(openPlans.Count, planWithOverdue.Count, planClosure, planCritical),
                planTop5,
                planMonthly,
                natureDonut,
                planResponsibles
            )
        );
    }
}
