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
    CapaFigureDto Opened,
    CapaFigureDto Closed,
    CapaFigureDto OnTimeRate,
    CapaFigureDto AvgClosureDays);

public record CapaIndicatorTypeDto(string Type, int OpenPlans, int LatePlans, int ClosedInPeriod, double? OnTimeRate);

public record CapaIndicatorDepartmentDto(string Name, string Organization, int OpenPlans, int LatePlans, int ClosedInPeriod, double? OnTimeRate);

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
    int DetailedActions);

public record GetCapaIndicatorsQuery(int Days = 90, Guid? OrganizationId = null) : IRequest<CapaIndicatorsDto>;

/// <summary>
/// CAPA indicators computed on the plans (not on their detailed actions, which are often missing): same definition of
/// "open", "late" and "on time" as the overview, so both pages agree.
/// </summary>
public class GetCapaIndicatorsQueryHandler : IRequestHandler<GetCapaIndicatorsQuery, CapaIndicatorsDto>
{
    private const int MaxDays = 366;
    private const int MonthsShown = 6;
    private const int OwnersShown = 6;

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
        if (request.OrganizationId is { } org) query = query.Where(p => p.OrganizationId == org);
        var plans = await query.ToListAsync(ct);

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

        var kpis = new CapaIndicatorKpisDto(
            open.Count,
            late.Count,
            new CapaFigureDto(openedNow, openedPrev),
            new CapaFigureDto(closedNow.Count, closedPrev.Count),
            new CapaFigureDto(OnTime(closedNow), OnTime(closedPrev)),
            new CapaFigureDto(AvgDays(closedNow), AvgDays(closedPrev)));

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

        var byDepartment = plans
            .GroupBy(p => p.DepartmentId)
            .Select(g => new CapaIndicatorDepartmentDto(
                g.First().Department?.Name ?? "—",
                g.First().Organization?.Name ?? "—",
                g.Count(PlanDeadlines.IsOpen),
                late.Count(p => p.DepartmentId == g.Key),
                closedNow.Count(p => p.DepartmentId == g.Key),
                OnTime(closedNow.Where(p => p.DepartmentId == g.Key).ToList())))
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
        return new CapaIndicatorsDto(days, now, kpis, aging, byType, byDepartment, monthly, owners, detailed);
    }
}
