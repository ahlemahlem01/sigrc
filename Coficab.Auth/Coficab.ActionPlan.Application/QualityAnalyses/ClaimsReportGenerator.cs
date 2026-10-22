using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses;

public sealed class ClaimsReportCriteria
{
    public string GroupBy { get; set; } = "severity";
    /// <summary>all | open | closed | late</summary>
    public string Status { get; set; } = "all";
    /// <summary>detection | created | deadline</summary>
    public string DateField { get; set; } = "detection";
    public string Q { get; set; } = string.Empty;
    public string Department { get; set; } = "all";
    public string Responsible { get; set; } = "all";
    public string Severity { get; set; } = "all";
}

/// <summary>
/// Builds the claims report on the server, in the shape the console shows and exports (criteria, groups with their
/// claims, totals, and the totals of the period just before) so that a scheduled report opens like a generated one.
/// </summary>
public static class ClaimsReportGenerator
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static ClaimsReportCriteria ParseCriteria(string json)
    {
        try { return JsonSerializer.Deserialize<ClaimsReportCriteria>(json, Json) ?? new(); }
        catch { return new(); }
    }

    private sealed record Row(
        Guid Id, string Title, string ClientId, string DefectType, string Severity, string StatusCode, DateTime? Deadline,
        DateTime DetectionDate, DateTime CreatedAt, string? AssignedToId, string? AssignedToName, string? CreatedById,
        bool Closed, bool Late, string Department);

    public static async Task<(string ResultJson, string CriteriaJson, int Count)> GenerateAsync(
        IApplicationDbContext context, ClaimsReportCriteria criteria, int periodDays, DateTime nowUtc, string? organizationIds, CancellationToken ct)
    {
        periodDays = Math.Clamp(periodDays, 1, 3660);
        var to = nowUtc.Date;
        var from = to.AddDays(-(periodDays - 1));
        var prevTo = from.AddDays(-1);
        var prevFrom = prevTo.AddDays(-(periodDays - 1));

        var departmentOf = (await context.UserProfiles.AsNoTracking().Where(p => p.Department != null)
                .Select(p => new { p.UserId, Name = p.Department!.Name }).ToListAsync(ct))
            .GroupBy(p => p.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Name, StringComparer.OrdinalIgnoreCase);
        string Department(string? assignee, string? creator)
        {
            if (!string.IsNullOrWhiteSpace(assignee) && departmentOf.TryGetValue(assignee, out var a)) return a;
            if (!string.IsNullOrWhiteSpace(creator) && departmentOf.TryGetValue(creator, out var c)) return c;
            return string.Empty;
        }

        var today = nowUtc.Date;
        var source = context.Claims.AsNoTracking().Where(c => !c.IsArchived && c.StatusCode != "DRAFT");
        if (ClaimOrganizations.Parse(organizationIds) is { } followed)
            source = await ClaimOrganizations.ApplyAsync(context, source, followed, ct);
        var claims = await source
            .Select(c => new { c.Id, c.Title, c.ClientId, c.DefectType, c.Severity, c.StatusCode, c.Deadline, c.DetectionDate, c.CreatedAt, c.AssignedToId, c.AssignedToName, c.CreatedById, c.LotNumber })
            .ToListAsync(ct);
        var all = claims.Select(c =>
        {
            var status = (c.StatusCode ?? string.Empty).ToUpperInvariant();
            var closed = status.Contains("CLOTUR") || status.Contains("CLOSED");
            return new Row(c.Id, c.Title, c.ClientId, c.DefectType, GetClaimsReportQueryHandler.SeverityKey(c.Severity), c.StatusCode ?? string.Empty,
                c.Deadline, c.DetectionDate, c.CreatedAt, c.AssignedToId, c.AssignedToName, c.CreatedById, closed,
                !closed && c.Deadline.HasValue && c.Deadline.Value.Date < today, Department(c.AssignedToId, c.CreatedById));
        }).ToList();

        List<Row> Select(DateTime f, DateTime t)
        {
            var term = criteria.Q.Trim().ToLowerInvariant();
            return all.Where(r =>
            {
                var date = criteria.DateField switch { "created" => (DateTime?)r.CreatedAt, "deadline" => r.Deadline, _ => r.DetectionDate };
                if (date == null || date.Value.Date < f || date.Value.Date > t) return false;
                if (criteria.Status == "open" && r.Closed) return false;
                if (criteria.Status == "closed" && !r.Closed) return false;
                if (criteria.Status == "late" && !r.Late) return false;
                if (criteria.Department != "all" && r.Department != criteria.Department) return false;
                if (criteria.Responsible == "__unassigned__" && !string.IsNullOrWhiteSpace(r.AssignedToName)) return false;
                if (criteria.Responsible != "all" && criteria.Responsible != "__unassigned__" && r.AssignedToName != criteria.Responsible) return false;
                if (criteria.Severity != "all" && r.Severity != criteria.Severity) return false;
                if (term.Length == 0) return true;
                return new[] { r.Title, r.ClientId, r.DefectType, r.AssignedToName }.Any(v => (v ?? string.Empty).ToLowerInvariant().Contains(term));
            }).ToList();
        }

        object Totals(List<Row> rows, int groups)
        {
            var closed = rows.Count(r => r.Closed);
            return new { total = rows.Count, closed, late = rows.Count(r => r.Late), open = rows.Count - closed, groups, rate = rows.Count == 0 ? 0 : (int)Math.Round(100.0 * closed / rows.Count) };
        }

        var current = Select(from, to);
        var previous = Select(prevFrom, prevTo);

        (string Key, string Label) GroupOf(Row r) => criteria.GroupBy switch
        {
            "responsible" => (string.IsNullOrWhiteSpace(r.AssignedToId) ? "—" : r.AssignedToId!, string.IsNullOrWhiteSpace(r.AssignedToName) ? "—" : r.AssignedToName!),
            "status" => (r.StatusCode, r.StatusCode),
            "defect" => (string.IsNullOrWhiteSpace(r.DefectType) ? "—" : r.DefectType, string.IsNullOrWhiteSpace(r.DefectType) ? "—" : r.DefectType),
            "client" => (string.IsNullOrWhiteSpace(r.ClientId) ? "—" : r.ClientId, string.IsNullOrWhiteSpace(r.ClientId) ? "—" : r.ClientId),
            "department" => (string.IsNullOrWhiteSpace(r.Department) ? "—" : r.Department, string.IsNullOrWhiteSpace(r.Department) ? "—" : r.Department),
            _ => (r.Severity, r.Severity),
        };

        var groups = current.GroupBy(r => GroupOf(r).Key)
            .Select(g =>
            {
                var rows = g.ToList();
                var closed = rows.Count(r => r.Closed);
                return new
                {
                    key = g.Key,
                    label = GroupOf(rows[0]).Label,
                    total = rows.Count,
                    closed,
                    late = rows.Count(r => r.Late),
                    open = rows.Count - closed,
                    rate = (int)Math.Round(100.0 * closed / rows.Count),
                    rows = rows.Select(r => new
                    {
                        claim = new
                        {
                            id = r.Id, title = r.Title, clientId = r.ClientId, defectType = r.DefectType, severity = r.Severity, statusCode = r.StatusCode,
                            deadline = r.Deadline, detectionDate = r.DetectionDate, createdAt = r.CreatedAt, assignedToId = r.AssignedToId,
                            assignedToName = r.AssignedToName, createdById = r.CreatedById,
                        },
                        closed = r.Closed,
                        late = r.Late,
                    }).ToList(),
                };
            })
            .OrderByDescending(g => g.late).ThenByDescending(g => g.total)
            .ToList();

        var criteriaOut = new
        {
            from = from.ToString("yyyy-MM-dd"), to = to.ToString("yyyy-MM-dd"), groupBy = criteria.GroupBy, status = criteria.Status,
            dateField = criteria.DateField, q = criteria.Q, department = criteria.Department, responsible = criteria.Responsible, severity = criteria.Severity,
        };
        var result = new
        {
            generatedAt = nowUtc,
            // the console gives these groups their translated names when it opens the report
            generatedBy = "schedule",
            criteria = criteriaOut,
            groups,
            totals = Totals(current, groups.Count),
            previous = Totals(previous, 0),
        };
        return (JsonSerializer.Serialize(result), JsonSerializer.Serialize(criteriaOut), current.Count);
    }
}
