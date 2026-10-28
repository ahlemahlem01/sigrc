using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Dashboard.Queries;

/// <summary>A figure for the chosen period and the same figure for the period just before it.</summary>
public record CapaFigureDto(double? Current, double? Previous);

public record CapaIndicatorKpisDto(
    int OpenPlans,
    int LatePlans,
    /// <summary>Unfinished detailed actions past their deadline, in open plans (a late plan without any is not counted here).</summary>
    int LateActions,
    /// <summary>Actions done at 100 % that wait for a validation.</summary>
    int ActionsToValidate,
    /// <summary>Open plans that have no detailed action at all: their delay is carried by the plan itself.</summary>
    int PlansWithoutActions,
    CapaFigureDto Opened,
    CapaFigureDto Closed,
    CapaFigureDto OnTimeRate,
    CapaFigureDto AvgClosureDays,
    /// <summary>Unfinished actions of open plans (the base of the critical-actions figure).</summary>
    int OpenActions,
    /// <summary>Unfinished actions of open plans whose priority is High (1): the most urgent level a detailed action can have.</summary>
    int CriticalOpenActions,
    /// <summary>Among those, the ones already past their deadline.</summary>
    int CriticalLateActions,
    /// <summary>Share of closed plans (in the period, and in the period before) whose effectiveness check found no defect: see <see cref="EfficacyEvaluated"/>.</summary>
    CapaFigureDto EfficacyRate,
    /// <summary>Plans closed in the period that were evaluated: their 8D file holds an effectiveness check on at least one lot (D6).</summary>
    int EfficacyEvaluated,
    /// <summary>Among those, the ones whose check was validated with no defect found: the same rule as the D6 step of the 8D.</summary>
    int EfficacyEffective);

public record CapaIndicatorTypeDto(string Type, int OpenPlans, int LatePlans, int ClosedInPeriod, double? OnTimeRate);

public record CapaIndicatorDepartmentDto(Guid Id, string Name, string Organization, int OpenPlans, int LatePlans, int ClosedInPeriod, double? OnTimeRate);

public record CapaIndicatorDomainDto(string Domain, int OpenPlans, int LatePlans, int ClosedInPeriod, double? OnTimeRate);

/// <summary>Plans at one step of the general workflow: the open plans of the perimeter for steps 1 to 5, the plans closed in the period for step 6.</summary>
public record CapaIndicatorStageDto(int Stage, string Code, int Plans);

public record CapaIndicatorMonthDto(string Month, int Opened, int Closed);

public record CapaIndicatorOwnerDto(string Name, int OpenPlans, int LatePlans);

public record CapaIndicatorsDto(
    int Days,
    DateTime GeneratedAt,
    CapaIndicatorKpisDto Kpis,
    OverviewAgingDto Aging,
    IReadOnlyList<CapaIndicatorTypeDto> ByType,
    IReadOnlyList<CapaIndicatorDepartmentDto> ByDepartment,
    IReadOnlyList<CapaIndicatorMonthDto> Monthly,
    IReadOnlyList<CapaIndicatorOwnerDto> Owners,
    int DetailedActions,
    /// <summary>One line per business domain of the perimeter, whatever the domain filter (it feeds the domain choice and keeps the comparison).</summary>
    IReadOnlyList<CapaIndicatorDomainDto> ByDomain,
    IReadOnlyList<CapaIndicatorStageDto> ByStage);

/// <param name="DepartmentId">Restricts every figure to one department; the by-department table still lists all of them.</param>
/// <param name="Domain">Restricts every figure to one business domain (reference list "domain"), the by-domain table still lists all of them.</param>
public record GetCapaIndicatorsQuery(int Days = 90, IReadOnlyList<Guid>? OrganizationIds = null, Guid? DepartmentId = null, string? Domain = null) : IRequest<CapaIndicatorsDto>;

/// <summary>
/// CAPA indicators computed on the plans (not on their detailed actions, which are often missing): same definition of
/// "open", "late" and "on time" as the overview, so both pages agree.
/// </summary>
public class GetCapaIndicatorsQueryHandler : IRequestHandler<GetCapaIndicatorsQuery, CapaIndicatorsDto>
{
    private const int MaxDays = 366;
    private const int MonthsShown = 6;
    private const int OwnersShown = 6;
    /// <summary>Priority of a detailed action: 1 = High, 2 = Medium, 3 = Low.</summary>
    private const int CriticalPriority = 1;

    private readonly IApplicationDbContext _context;

    public GetCapaIndicatorsQueryHandler(IApplicationDbContext context) => _context = context;

    private static double? Rate(int ok, int total) => total == 0 ? null : Math.Round(100.0 * ok / total, 1);

    public async Task<CapaIndicatorsDto> Handle(GetCapaIndicatorsQuery request, CancellationToken ct)
    {
        var days = Math.Clamp(request.Days, 7, MaxDays);
        var now = DateTime.UtcNow;
        var today = now.Date;
        var end = today.AddDays(1);
        var start = today.AddDays(-days);
        var prevStart = start.AddDays(-days);

        var query = _context.ActionPlans.AsNoTracking().Include(p => p.PlanActions).Include(p => p.Department).Include(p => p.Organization)
            .Where(p => !p.IsArchived);
        if (request.OrganizationIds is { Count: > 0 } orgs) query = query.Where(p => orgs.Contains(p.OrganizationId));
        var perimeter = await query.ToListAsync(ct);
        var domain = request.Domain?.Trim();
        var allPlans = string.IsNullOrEmpty(domain) ? perimeter : perimeter.Where(p => string.Equals(p.Domain, domain, StringComparison.OrdinalIgnoreCase)).ToList();
        var plans = request.DepartmentId is { } departmentId ? allPlans.Where(p => p.DepartmentId == departmentId).ToList() : allPlans;

        var open = plans.Where(PlanDeadlines.IsOpen).ToList();
        var late = open.Where(p => PlanDeadlines.OverdueDays(p, today) > 0).ToList();

        var closedAll = plans.Where(p => p.Status == ActionPlanStatus.Closed && p.CompletedAt != null).ToList();
        List<Core.Entities.ActionPlan> ClosedBetween(DateTime from, DateTime to) =>
            closedAll.Where(p => p.CompletedAt >= from && p.CompletedAt < to).ToList();
        double? OnTime(List<Core.Entities.ActionPlan> list)
        {
            var judged = list.Where(p => p.IsOnTime != null).ToList();
            return Rate(judged.Count(p => p.IsOnTime == true), judged.Count);
        }
        double? AvgDays(List<Core.Entities.ActionPlan> list) =>
            list.Count == 0 ? null : Math.Round(list.Average(p => Math.Max(0, (p.CompletedAt!.Value - p.CreatedAt).TotalDays)), 1);

        var closedNow = ClosedBetween(start, end);
        var closedPrev = ClosedBetween(prevStart, start);
        var openedNow = plans.Count(p => p.CreatedAt >= start && p.CreatedAt < end);
        var openedPrev = plans.Count(p => p.CreatedAt >= prevStart && p.CreatedAt < start);

        var openActions = open.SelectMany(p => p.PlanActions.Where(a => !a.IsArchived)).ToList();
        var unfinished = openActions.Where(a => !PlanDeadlines.IsFinished(a)).ToList();
        var critical = unfinished.Where(a => a.Priority == CriticalPriority).ToList();

        // Efficacy = what the 8D file says about the lots checked after the corrective action (D6): evaluated = at least one lot checked,
        // effective = validated and no defect found (the rule the 8D itself applies to move on). Plans without a claim or without a check are not judged.
        var claimIds = closedAll.Where(p => p.ClaimId != null).Select(p => p.ClaimId!.Value).Distinct().ToList();
        var checks = claimIds.Count == 0
            ? new Dictionary<Guid, (bool Evaluated, bool Effective)>()
            : (await _context.EightDDossiers.AsNoTracking().Where(d => claimIds.Contains(d.ClaimId))
                .Select(d => new { d.ClaimId, d.LotsChecked, d.DefectsFound, d.EffectivenessValidated }).ToListAsync(ct))
                .GroupBy(d => d.ClaimId)
                .ToDictionary(g => g.Key, g => (
                    Evaluated: g.Any(d => (d.LotsChecked ?? 0) > 0),
                    Effective: g.Any(d => (d.LotsChecked ?? 0) > 0 && d.EffectivenessValidated && (d.DefectsFound ?? 0) == 0)));
        (int Evaluated, int Effective) Efficacy(List<Core.Entities.ActionPlan> list)
        {
            var judged = list.Where(p => p.ClaimId != null && checks.TryGetValue(p.ClaimId.Value, out var c) && c.Evaluated).ToList();
            return (judged.Count, judged.Count(p => checks[p.ClaimId!.Value].Effective));
        }
        var efficacyNow = Efficacy(closedNow);
        var efficacyPrev = Efficacy(closedPrev);

        var kpis = new CapaIndicatorKpisDto(
            open.Count,
            late.Count,
            openActions.Count(a => !PlanDeadlines.IsFinished(a) && a.Deadline.HasValue && a.Deadline.Value.Date < today),
            openActions.Count(a => a.Progress == ActionProgress.Hundred),
            open.Count(p => !p.PlanActions.Any(a => !a.IsArchived)),
            new CapaFigureDto(openedNow, openedPrev),
            new CapaFigureDto(closedNow.Count, closedPrev.Count),
            new CapaFigureDto(OnTime(closedNow), OnTime(closedPrev)),
            new CapaFigureDto(AvgDays(closedNow), AvgDays(closedPrev)),
            unfinished.Count,
            critical.Count,
            critical.Count(a => a.Deadline.HasValue && a.Deadline.Value.Date < today),
            new CapaFigureDto(Rate(efficacyNow.Effective, efficacyNow.Evaluated), Rate(efficacyPrev.Effective, efficacyPrev.Evaluated)),
            efficacyNow.Evaluated,
            efficacyNow.Effective);

        var aging = new OverviewAgingDto(0, 0, 0);
        var lags = late.Select(p => PlanDeadlines.MaxLagDays(p, today)).ToList();
        aging = new OverviewAgingDto(lags.Count(d => d <= 30), lags.Count(d => d > 30 && d <= 90), lags.Count(d => d > 90));

        var byType = Enum.GetValues<ActionPlanType>()
            .Select(t => new CapaIndicatorTypeDto(
                t.ToString(),
                open.Count(p => p.Type == t),
                late.Count(p => p.Type == t),
                closedNow.Count(p => p.Type == t),
                OnTime(closedNow.Where(p => p.Type == t).ToList())))
            .ToList();

        // Every department of the perimeter, whatever the department filter: it feeds the department choice and keeps the comparison.
        var openAll = allPlans.Where(PlanDeadlines.IsOpen).ToList();
        var lateAll = openAll.Where(p => PlanDeadlines.OverdueDays(p, today) > 0).ToList();
        var closedNowAll = allPlans.Where(p => p.Status == ActionPlanStatus.Closed && p.CompletedAt != null && p.CompletedAt >= start && p.CompletedAt < end).ToList();
        var byDepartment = allPlans
            .GroupBy(p => p.DepartmentId)
            .Select(g => new CapaIndicatorDepartmentDto(
                g.Key,
                g.First().Department?.Name ?? "—",
                g.First().Organization?.Name ?? "—",
                openAll.Count(p => p.DepartmentId == g.Key),
                lateAll.Count(p => p.DepartmentId == g.Key),
                closedNowAll.Count(p => p.DepartmentId == g.Key),
                OnTime(closedNowAll.Where(p => p.DepartmentId == g.Key).ToList())))
            .Where(d => d.OpenPlans > 0 || d.ClosedInPeriod > 0)
            .OrderByDescending(d => d.LatePlans).ThenByDescending(d => d.OpenPlans)
            .ToList();

        var firstMonth = new DateTime(today.Year, today.Month, 1).AddMonths(-(MonthsShown - 1));
        var monthly = Enumerable.Range(0, MonthsShown)
            .Select(i => firstMonth.AddMonths(i))
            .Select(m => new CapaIndicatorMonthDto(
                $"{m:yyyy-MM}",
                plans.Count(p => p.CreatedAt >= m && p.CreatedAt < m.AddMonths(1)),
                closedAll.Count(p => p.CompletedAt >= m && p.CompletedAt < m.AddMonths(1))))
            .ToList();

        var perOwner = open.Where(p => !string.IsNullOrWhiteSpace(p.AssignedToId))
            .GroupBy(p => p.AssignedToId!, StringComparer.OrdinalIgnoreCase)
            .Select(g => new { Id = g.Key, Open = g.Count(), Late = g.Count(p => PlanDeadlines.OverdueDays(p, today) > 0) })
            .OrderByDescending(x => x.Late).ThenByDescending(x => x.Open)
            .Take(OwnersShown)
            .ToList();
        var ids = perOwner.Select(x => x.Id).ToList();
        var names = (await _context.UserProfiles.AsNoTracking().Where(u => ids.Contains(u.UserId)).ToListAsync(ct))
            .ToDictionary(u => u.UserId, u => u.Name, StringComparer.OrdinalIgnoreCase);
        var owners = perOwner.Select(x => new CapaIndicatorOwnerDto(names.GetValueOrDefault(x.Id) ?? "—", x.Open, x.Late)).ToList();

        var detailed = open.Sum(p => p.PlanActions.Count(a => !a.IsArchived));

        var openPerimeter = perimeter.Where(PlanDeadlines.IsOpen).ToList();
        var closedPerimeter = perimeter.Where(p => p.Status == ActionPlanStatus.Closed && p.CompletedAt != null && p.CompletedAt >= start && p.CompletedAt < end).ToList();
        var byDomain = perimeter.Select(p => p.Domain).Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(d => new CapaIndicatorDomainDto(
                d,
                openPerimeter.Count(p => string.Equals(p.Domain, d, StringComparison.OrdinalIgnoreCase)),
                openPerimeter.Count(p => string.Equals(p.Domain, d, StringComparison.OrdinalIgnoreCase) && PlanDeadlines.OverdueDays(p, today) > 0),
                closedPerimeter.Count(p => string.Equals(p.Domain, d, StringComparison.OrdinalIgnoreCase)),
                OnTime(closedPerimeter.Where(p => string.Equals(p.Domain, d, StringComparison.OrdinalIgnoreCase)).ToList())))
            .OrderByDescending(d => d.LatePlans).ThenByDescending(d => d.OpenPlans).ThenBy(d => d.Domain)
            .ToList();
        var byStage = Enumerable.Range(PlanWorkflow.Detection, PlanWorkflow.Closure)
            .Select(stage => new CapaIndicatorStageDto(
                stage, PlanWorkflow.Code(stage),
                stage == PlanWorkflow.Closure ? closedNow.Count : open.Count(p => PlanWorkflow.Of(p) == stage)))
            .ToList();
        return new CapaIndicatorsDto(days, now, kpis, aging, byType, byDepartment, monthly, owners, detailed, byDomain, byStage);
    }
}
