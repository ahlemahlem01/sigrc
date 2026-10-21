using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

/// <summary>Open / closed / late figures of one group of claims (a severity, a department, a defect type).</summary>
public record ClaimsReportGroupDto(string Key, string Name, int Total, int Closed, int Open, int Late, IReadOnlyList<string> Departments);

public record ClaimsReportDto(
    DateTime GeneratedAt,
    ClaimsReportGroupDto Overall,
    IReadOnlyList<ClaimsReportGroupDto> BySeverity,
    IReadOnlyList<ClaimsReportGroupDto> ByDepartment,
    IReadOnlyList<ClaimsReportGroupDto> ByDefect);

public record GetClaimsReportQuery(string? OrganizationIds = null, string? ScopeUserId = null) : IRequest<ClaimsReportDto>;

/// <summary>
/// The claims report: how many claims, how many are closed and how many are late, overall and by severity, department
/// and defect type. A claim belongs to the department of its assignee and, failing that, of its creator. Late = open
/// with a deadline in the past.
/// </summary>
public class GetClaimsReportQueryHandler : IRequestHandler<GetClaimsReportQuery, ClaimsReportDto>
{
    private readonly IApplicationDbContext _context;

    public GetClaimsReportQueryHandler(IApplicationDbContext context) => _context = context;

    public static string SeverityKey(string? raw)
    {
        var s = (raw ?? string.Empty).Trim().ToUpperInvariant();
        if (s.StartsWith("CRIT")) return "critical";
        if (s.StartsWith("HIGH") || s.StartsWith("ELEV") || s.StartsWith("ÉLEV")) return "high";
        if (s.StartsWith("MED") || s.StartsWith("MOY")) return "medium";
        return "low";
    }

    private static bool IsClosed(string? status)
    {
        var s = (status ?? string.Empty).ToUpperInvariant();
        return s.Contains("CLOTUR") || s.Contains("CLOSED");
    }

    public async Task<ClaimsReportDto> Handle(GetClaimsReportQuery request, CancellationToken ct)
    {
        var query = _context.Claims.AsNoTracking().Where(c => !c.IsArchived && c.StatusCode != "DRAFT");
        if (!string.IsNullOrWhiteSpace(request.ScopeUserId))
            query = await ClaimVisibility.ApplyAsync(_context, query, request.ScopeUserId, ct);
        if (ClaimOrganizations.Parse(request.OrganizationIds) is { } followed)
            query = await ClaimOrganizations.ApplyAsync(_context, query, followed, ct);

        var claims = await query
            .Select(c => new { c.Severity, c.StatusCode, c.Deadline, c.DefectType, c.AssignedToId, c.CreatedById })
            .ToListAsync(ct);

        var departmentOf = (await _context.UserProfiles.AsNoTracking()
                .Where(p => p.Department != null)
                .Select(p => new { p.UserId, Name = p.Department!.Name })
                .ToListAsync(ct))
            .GroupBy(p => p.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Name, StringComparer.OrdinalIgnoreCase);

        string Department(string? assignee, string? creator)
        {
            if (!string.IsNullOrWhiteSpace(assignee) && departmentOf.TryGetValue(assignee, out var a)) return a;
            if (!string.IsNullOrWhiteSpace(creator) && departmentOf.TryGetValue(creator, out var c)) return c;
            return string.Empty;
        }

        var now = DateTime.UtcNow;
        var rows = claims.Select(c =>
        {
            var closed = IsClosed(c.StatusCode);
            return new
            {
                Severity = SeverityKey(c.Severity),
                Department = Department(c.AssignedToId, c.CreatedById),
                Defect = string.IsNullOrWhiteSpace(c.DefectType) ? string.Empty : c.DefectType.Trim(),
                Closed = closed,
                Late = !closed && c.Deadline.HasValue && c.Deadline.Value < now,
            };
        }).ToList();

        ClaimsReportGroupDto Group(string key, string name, IEnumerable<(string Department, bool Closed, bool Late)> items)
        {
            var list = items.ToList();
            return new ClaimsReportGroupDto(
                key, name, list.Count, list.Count(i => i.Closed), list.Count(i => !i.Closed), list.Count(i => i.Late),
                list.Select(i => i.Department).Where(d => d != string.Empty).Distinct().OrderBy(d => d).ToList());
        }

        var overall = Group("all", "all", rows.Select(r => (r.Department, r.Closed, r.Late)));
        var bySeverity = new[] { "critical", "high", "medium", "low" }
            .Select(k => Group(k, k, rows.Where(r => r.Severity == k).Select(r => (r.Department, r.Closed, r.Late))))
            .ToList();
        var byDepartment = rows.GroupBy(r => r.Department)
            .Select(g => Group(g.Key, g.Key, g.Select(r => (r.Department, r.Closed, r.Late))))
            .OrderByDescending(g => g.Late).ThenByDescending(g => g.Open).ThenBy(g => g.Name)
            .ToList();
        var byDefect = rows.Where(r => r.Defect != string.Empty).GroupBy(r => r.Defect, StringComparer.OrdinalIgnoreCase)
            .Select(g => Group(g.Key, g.Key, g.Select(r => (r.Department, r.Closed, r.Late))))
            .OrderByDescending(g => g.Late).ThenByDescending(g => g.Open).ThenBy(g => g.Name)
            .Take(30)
            .ToList();

        return new ClaimsReportDto(now, overall, bySeverity, byDepartment, byDefect);
    }
}
