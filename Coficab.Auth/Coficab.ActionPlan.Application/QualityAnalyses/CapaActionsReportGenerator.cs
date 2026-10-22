using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses;

public sealed class CapaActionsReportCriteria
{
    /// <summary>responsible | process | nature | status | plan</summary>
    public string GroupBy { get; set; } = "responsible";
    /// <summary>all | open | closed | late</summary>
    public string Status { get; set; } = "all";
    /// <summary>created | deadline</summary>
    public string DateField { get; set; } = "created";
    public string Process { get; set; } = "all";
    /// <summary>all | preventif | correctif | amelioration</summary>
    public string Nature { get; set; } = "all";
    public string Responsible { get; set; } = "all";
    public string Q { get; set; } = string.Empty;
}

/// <summary>
/// Builds the CAPA sub-action report on the server, in the shape of the console (criteria, groups with their actions,
/// totals, totals of the period just before), so that a scheduled report opens like a generated one.
/// </summary>
public static class CapaActionsReportGenerator
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static CapaActionsReportCriteria ParseCriteria(string json)
    {
        try { return JsonSerializer.Deserialize<CapaActionsReportCriteria>(json, Json) ?? new(); }
        catch { return new(); }
    }

    private sealed record Flat(
        Guid Id, string Title, Guid PlanId, string PlanTitle, string Type, string Process, int Progress, int ProgressRaw, string ProgressKind,
        DateTime? Deadline, DateTime CreatedAt, string? AssignedToId, string? AssignedToName, int Priority, bool Late, bool Closed);

    public static async Task<(string ResultJson, string CriteriaJson, int Count)> GenerateAsync(
        IApplicationDbContext context, CapaActionsReportCriteria criteria, int periodDays, DateTime nowUtc, string? organizationIds, CancellationToken ct)
    {
        periodDays = Math.Clamp(periodDays, 1, 3660);
        var to = nowUtc.Date;
        var from = to.AddDays(-(periodDays - 1));
        var prevTo = from.AddDays(-1);
        var prevFrom = prevTo.AddDays(-(periodDays - 1));

        var plans = context.ActionPlans.AsNoTracking().Include(p => p.Department).Include(p => p.PlanActions)
            .Where(p => !p.IsArchived && p.Status != ActionPlanStatus.Archived);
        if (ClaimOrganizations.Parse(organizationIds) is { } followed)
            plans = plans.Where(p => followed.Contains(p.OrganizationId));
        var planList = await plans.ToListAsync(ct);

        var names = (await context.UserProfiles.AsNoTracking().Select(p => new { p.UserId, p.Name }).ToListAsync(ct))
            .GroupBy(p => p.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Name, StringComparer.OrdinalIgnoreCase);

        var all = new List<Flat>();
        foreach (var p in planList)
        {
            var type = p.Type switch { ActionPlanType.PAC => "correctif", ActionPlanType.PAP => "amelioration", _ => "preventif" };
            var process = string.IsNullOrWhiteSpace(p.Department?.Name) ? "—" : p.Department!.Name;
            foreach (var a in p.PlanActions.Where(x => !x.IsArchived))
            {
                var raw = (int)a.Progress;
                var kind = raw == 102 ? "cancelled" : raw == 101 ? "validated" : raw >= 100 ? "closed" : "open";
                var closed = kind is "closed" or "validated";
                var assignee = string.IsNullOrWhiteSpace(a.AssignedToId) ? p.AssignedToId : a.AssignedToId;
                all.Add(new Flat(
                    a.Id, a.Title, p.Id, p.Title, type, process, raw == 101 ? 100 : raw == 102 ? 0 : Math.Clamp(raw, 0, 100), raw, kind,
                    a.Deadline, a.CreatedAt, string.IsNullOrWhiteSpace(assignee) ? null : assignee,
                    !string.IsNullOrWhiteSpace(assignee) && names.TryGetValue(assignee, out var n) ? n : null, a.Priority,
                    !closed && kind != "cancelled" && a.Deadline.HasValue && a.Deadline.Value < nowUtc, closed));
            }
        }

        List<Flat> Select(DateTime f, DateTime t)
        {
            var term = criteria.Q.Trim().ToLowerInvariant();
            return all.Where(a =>
            {
                var date = criteria.DateField == "deadline" ? a.Deadline : (DateTime?)a.CreatedAt;
                if (date == null || date.Value.Date < f || date.Value.Date > t) return false;
                if (criteria.Process != "all" && a.Process != criteria.Process) return false;
                if (criteria.Nature != "all" && a.Type != criteria.Nature) return false;
                if (criteria.Responsible == "__unassigned__" && a.AssignedToId != null) return false;
                if (criteria.Responsible != "all" && criteria.Responsible != "__unassigned__" && a.AssignedToId != criteria.Responsible) return false;
                if (criteria.Status == "open" && a.Closed) return false;
                if (criteria.Status == "closed" && !a.Closed) return false;
                if (criteria.Status == "late" && !a.Late) return false;
                if (term.Length == 0) return true;
                return $"{a.Title} {a.PlanTitle} {a.Process} {a.AssignedToName}".ToLowerInvariant().Contains(term);
            }).ToList();
        }

        object Totals(List<Flat> rows, int groups)
        {
            var closed = rows.Count(r => r.Closed);
            return new { total = rows.Count, closed, late = rows.Count(r => r.Late), open = rows.Count - closed, groups, rate = rows.Count == 0 ? 0 : (int)Math.Round(100.0 * closed / rows.Count) };
        }

        var current = Select(from, to);
        var previous = Select(prevFrom, prevTo);

        string KeyOf(Flat a) => criteria.GroupBy switch
        {
            "process" => string.IsNullOrWhiteSpace(a.Process) ? "—" : a.Process,
            "nature" => a.Type,
            "status" => a.Closed ? "closed" : a.Late ? "late" : "open",
            "plan" => a.PlanId.ToString(),
            _ => a.AssignedToId ?? "__unassigned__",
        };
        object FlatJson(Flat a) => new
        {
            id = a.Id, title = a.Title, planId = a.PlanId, planTitle = a.PlanTitle, type = a.Type, process = a.Process, progress = a.Progress,
            progressRaw = a.ProgressRaw, progressKind = a.ProgressKind, deadline = a.Deadline, createdAt = a.CreatedAt, assignedToId = a.AssignedToId,
            assignedToName = a.AssignedToName, priority = a.Priority, late = a.Late, closed = a.Closed, archived = false,
        };

        var groups = current.GroupBy(KeyOf).Select(g =>
        {
            var list = g.ToList();
            var closed = list.Count(x => x.Closed);
            var first = list[0];
            var label = criteria.GroupBy switch
            {
                "responsible" => g.Key == "__unassigned__" ? g.Key : (first.AssignedToName ?? g.Key[..Math.Min(8, g.Key.Length)]),
                "plan" => first.PlanTitle,
                _ => g.Key,
            };
            return new
            {
                key = g.Key, label, total = list.Count, closed, late = list.Count(x => x.Late), open = list.Count - closed,
                rate = (int)Math.Round(100.0 * closed / list.Count), actions = list.Select(FlatJson).ToList(),
            };
        }).OrderByDescending(g => g.total).ToList();

        var criteriaOut = new
        {
            from = from.ToString("yyyy-MM-dd"), to = to.ToString("yyyy-MM-dd"), groupBy = criteria.GroupBy, status = criteria.Status,
            dateField = criteria.DateField, process = criteria.Process, nature = criteria.Nature, responsible = criteria.Responsible, q = criteria.Q,
        };
        var result = new
        {
            generatedAt = nowUtc,
            generatedBy = "schedule",
            criteria = criteriaOut,
            actions = current.Select(FlatJson).ToList(),
            groups,
            totals = Totals(current, groups.Count),
            previous = Totals(previous, 0),
        };
        return (JsonSerializer.Serialize(result), JsonSerializer.Serialize(criteriaOut), current.Count);
    }
}
