using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Dashboard.Queries;

public record CapaWorkloadPlanDto(Guid Id, string Title, string Type, bool Closed, DateTime? Deadline, int LateDays, int Progress);

public record CapaWorkloadPersonDto(
    string UserId,
    string Name,
    string Email,
    string Department,
    int OpenPlans,
    int LatePlans,
    int ClosedPlans,
    double? AvgProgress,
    DateTime? NextDeadline,
    IReadOnlyList<CapaWorkloadPlanDto> Plans);

public record CapaWorkloadSummaryDto(int People, double AverageOpen, int Overloaded, int WithoutOpenPlan);

public record CapaWorkloadDto(DateTime GeneratedAt, CapaWorkloadSummaryDto Summary, IReadOnlyList<CapaWorkloadPersonDto> People);

public record GetCapaWorkloadQuery(IReadOnlyList<Guid>? OrganizationIds = null) : IRequest<CapaWorkloadDto>;

/// <summary>
/// Who carries the CAPA plans: for each person their open plans, how many are late and what comes next. A person is
/// responsible for a plan they are assigned to or may edit. "Late" is the same definition as everywhere else.
/// </summary>
public class GetCapaWorkloadQueryHandler : IRequestHandler<GetCapaWorkloadQuery, CapaWorkloadDto>
{
    /// <summary>Someone with at least this many times the average of open plans (and at least <see cref="OverloadMin"/>) is overloaded.</summary>
    private const double OverloadFactor = 1.5;
    private const int OverloadMin = 4;

    private readonly IApplicationDbContext _context;

    public GetCapaWorkloadQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<CapaWorkloadDto> Handle(GetCapaWorkloadQuery request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var today = now.Date;

        var query = _context.ActionPlans.AsNoTracking().Include(p => p.PlanActions).Where(p => !p.IsArchived);
        if (request.OrganizationIds is { Count: > 0 } orgs) query = query.Where(p => orgs.Contains(p.OrganizationId));
        var plans = await query.ToListAsync(ct);
        var planIds = plans.Select(p => p.Id).ToList();

        // who edits which plan, beside the plan's own assignee
        var editors = await _context.UserActionPlanAssignments.AsNoTracking()
            .Where(a => a.CanEdit && planIds.Contains(a.ActionPlanId))
            .Select(a => new { a.ActionPlanId, a.UserId })
            .ToListAsync(ct);

        var responsible = new Dictionary<string, List<Core.Entities.ActionPlan>>(StringComparer.OrdinalIgnoreCase);
        void Add(string? userId, Core.Entities.ActionPlan plan)
        {
            if (string.IsNullOrWhiteSpace(userId)) return;
            if (!responsible.TryGetValue(userId, out var list)) responsible[userId] = list = [];
            if (!list.Contains(plan)) list.Add(plan);
        }
        var byId = plans.ToDictionary(p => p.Id);
        foreach (var p in plans) Add(p.AssignedToId, p);
        foreach (var e in editors) if (byId.TryGetValue(e.ActionPlanId, out var plan)) Add(e.UserId, plan);

        var profiles = await _context.UserProfiles.AsNoTracking().Include(u => u.Department).ToListAsync(ct);
        var profileById = profiles.GroupBy(p => p.UserId, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        // a deactivated account (locked, profile inactive) no longer carries work
        bool Inactive(string id) => profileById.TryGetValue(id, out var pr) && string.Equals(pr.Status, "inactive", StringComparison.OrdinalIgnoreCase);

        var people = responsible.Where(kv => !Inactive(kv.Key)).Select(kv =>
        {
            profileById.TryGetValue(kv.Key, out var profile);
            var open = kv.Value.Where(PlanDeadlines.IsOpen).ToList();
            var late = open.Where(p => PlanDeadlines.OverdueDays(p, today) > 0).ToList();
            var upcoming = open.Where(p => p.Deadline.HasValue).Select(p => p.Deadline!.Value).OrderBy(d => d).FirstOrDefault();
            var rows = kv.Value
                .Select(p => new CapaWorkloadPlanDto(
                    p.Id, p.Title, p.Type.ToString(), !PlanDeadlines.IsOpen(p), p.Deadline,
                    PlanDeadlines.MaxLagDays(p, today), Math.Clamp(p.Progress, 0, 100)))
                .OrderBy(r => r.Closed).ThenByDescending(r => r.LateDays).ThenBy(r => r.Deadline ?? DateTime.MaxValue)
                .ToList();
            return new CapaWorkloadPersonDto(
                kv.Key,
                profile?.Name ?? "—",
                profile?.Email ?? string.Empty,
                profile?.Department?.Name ?? string.Empty,
                open.Count,
                late.Count,
                kv.Value.Count(p => p.Status == ActionPlanStatus.Closed),
                open.Count == 0 ? null : Math.Round(open.Average(p => (double)p.Progress), 0),
                upcoming == default ? null : upcoming,
                rows);
        })
        .Where(p => p.OpenPlans > 0 || p.ClosedPlans > 0)
        .OrderByDescending(p => p.LatePlans).ThenByDescending(p => p.OpenPlans).ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
        .ToList();

        // people of the followed organizations who carry nothing right now
        var inScope = profiles.Where(p => p.Department != null
                && (request.OrganizationIds is not { Count: > 0 } o || o.Contains(p.Department.OrganizationId))
                && !string.Equals(p.Status, "inactive", StringComparison.OrdinalIgnoreCase)
                && !(p.Role ?? string.Empty).Contains("admin", StringComparison.OrdinalIgnoreCase))
            .Select(p => p.UserId).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var busy = people.Where(p => p.OpenPlans > 0).Select(p => p.UserId).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var idle = inScope.Count(id => !busy.Contains(id));

        var withOpen = people.Where(p => p.OpenPlans > 0).ToList();
        var average = withOpen.Count == 0 ? 0 : withOpen.Average(p => (double)p.OpenPlans);
        var overloaded = withOpen.Count(p => p.OpenPlans >= OverloadMin && p.OpenPlans >= OverloadFactor * average);

        return new CapaWorkloadDto(now, new CapaWorkloadSummaryDto(withOpen.Count, Math.Round(average, 1), overloaded, idle), people);
    }
}
