using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

public record ClaimsAuditEventDto(
    string Id, Guid? ClaimId, string ClaimTitle, string ActionType, string ActorId, string ActorName, string? Detail,
    DateTime CreatedAt, string? DepartmentId, string? DepartmentName);

public record GetClaimsAuditQuery(string? OrganizationIds = null, string? ScopeUserId = null, int Limit = 5000) : IRequest<IReadOnlyList<ClaimsAuditEventDto>>;

/// <summary>
/// The audit log of claims: the recorded claim events, the 8D dossier history (saved, submitted, approved, rejected)
/// and the imports. The department of an event is the one of its claim (assignee, else creator).
/// </summary>
public class GetClaimsAuditQueryHandler : IRequestHandler<GetClaimsAuditQuery, IReadOnlyList<ClaimsAuditEventDto>>
{
    private readonly IApplicationDbContext _context;

    public GetClaimsAuditQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<ClaimsAuditEventDto>> Handle(GetClaimsAuditQuery request, CancellationToken ct)
    {
        var claims = _context.Claims.AsNoTracking().IgnoreQueryFilters();
        if (!string.IsNullOrWhiteSpace(request.ScopeUserId))
            claims = await ClaimVisibility.ApplyAsync(_context, claims, request.ScopeUserId, ct);
        if (ClaimOrganizations.Parse(request.OrganizationIds) is { } followed)
            claims = await ClaimOrganizations.ApplyAsync(_context, claims, followed, ct);
        var claimRows = await claims.Select(c => new { c.Id, c.Title, c.AssignedToId, c.CreatedById }).ToListAsync(ct);
        var claimById = claimRows.ToDictionary(c => c.Id);
        var scoped = request.OrganizationIds != null || request.ScopeUserId != null;

        var profiles = await _context.UserProfiles.AsNoTracking().Include(p => p.Department).ToListAsync(ct);
        var profileById = profiles.GroupBy(p => p.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var aliases = await ClaimVisibility.AliasesAsync(_context, ct);
        string Name(string? id) => string.IsNullOrWhiteSpace(id) ? string.Empty : ClaimVisibility.PersonName(profiles, id, id, aliases) ?? id;
        (string? Id, string? Name) Dept(Guid claimId)
        {
            if (!claimById.TryGetValue(claimId, out var c)) return (null, null);
            foreach (var who in new[] { c.AssignedToId, c.CreatedById })
                if (!string.IsNullOrWhiteSpace(who) && profileById.TryGetValue(who, out var p) && p.Department != null)
                    return (p.Department.Id.ToString(), p.Department.Name);
            return (null, null);
        }

        var result = new List<ClaimsAuditEventDto>();
        var limit = Math.Clamp(request.Limit, 1, 20000);

        var events = await _context.ClaimEvents.AsNoTracking().OrderByDescending(e => e.CreatedAt).Take(limit).ToListAsync(ct);
        foreach (var e in events)
        {
            if (scoped && !claimById.ContainsKey(e.ClaimId)) continue;
            var (deptId, deptName) = Dept(e.ClaimId);
            result.Add(new ClaimsAuditEventDto(
                $"ce-{e.Id}", e.ClaimId, claimById.TryGetValue(e.ClaimId, out var c) ? c.Title : string.Empty,
                e.ActionType, e.ActorId, Name(e.ActorId), e.Detail, e.CreatedAt, deptId, deptName));
        }

        var versions = await _context.EightDVersions.AsNoTracking()
            .Where(v => v.EventType != "baseline")
            .OrderByDescending(v => v.SavedAt).Take(limit)
            .Select(v => new { v.Id, v.ClaimId, v.EventType, v.SavedById, v.SavedAt, v.ChangedFields, v.Comment, v.CurrentStep, v.VersionNumber })
            .ToListAsync(ct);
        foreach (var v in versions)
        {
            if (scoped && !claimById.ContainsKey(v.ClaimId)) continue;
            var (deptId, deptName) = Dept(v.ClaimId);
            var type = v.EventType switch { "submitted" => "eightd_submitted", "approved" => "eightd_validated", "rejected" => "eightd_rejected", _ => "eightd_saved" };
            var detail = string.Join(" · ", new[]
            {
                $"v{v.VersionNumber} · D{v.CurrentStep}",
                string.IsNullOrWhiteSpace(v.ChangedFields) ? null : v.ChangedFields,
                string.IsNullOrWhiteSpace(v.Comment) ? null : v.Comment,
            }.Where(x => x != null));
            result.Add(new ClaimsAuditEventDto(
                $"e8-{v.Id}", v.ClaimId, claimById.TryGetValue(v.ClaimId, out var c) ? c.Title : string.Empty,
                type, v.SavedById ?? string.Empty, Name(v.SavedById), detail, v.SavedAt, deptId, deptName));
        }

        // imports are not tied to one claim: one event per file
        if (!scoped)
        {
            var batches = await _context.ImportBatches.AsNoTracking().OrderByDescending(b => b.CreatedAt).Take(500).ToListAsync(ct);
            foreach (var b in batches)
                result.Add(new ClaimsAuditEventDto(
                    $"ib-{b.Id}", null, b.FileName, "claim_imported", b.CreatedBy, Name(b.CreatedBy),
                    $"{b.ClaimCount} · {b.CauseCount}", b.CreatedAt, null, null));
        }

        return result.OrderByDescending(r => r.CreatedAt).Take(limit).ToList();
    }
}
