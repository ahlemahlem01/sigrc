using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

public record ClaimsByPersonDto(string UserId, int Open, int Closed, int Late, double? AvgClosureDays);

public record GetClaimsByPersonQuery(string? OrganizationIds = null) : IRequest<IReadOnlyList<ClaimsByPersonDto>>;

/// <summary>
/// Claims per person: a claim belongs to the person it is assigned to and, when nobody is assigned, to its creator
/// (the rule of the other pages). Late = open with a deadline in the past.
/// </summary>
public class GetClaimsByPersonQueryHandler : IRequestHandler<GetClaimsByPersonQuery, IReadOnlyList<ClaimsByPersonDto>>
{
    private readonly IApplicationDbContext _context;

    public GetClaimsByPersonQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<ClaimsByPersonDto>> Handle(GetClaimsByPersonQuery request, CancellationToken ct)
    {
        var query = _context.Claims.AsNoTracking().Where(c => !c.IsArchived && c.StatusCode != "DRAFT");
        if (ClaimOrganizations.Parse(request.OrganizationIds) is { } followed)
            query = await ClaimOrganizations.ApplyAsync(_context, query, followed, ct);

        var rows = await query
            .Select(c => new { c.AssignedToId, c.CreatedById, c.StatusCode, c.Deadline, c.CreatedAt, c.CompletedAt, c.UpdatedAt })
            .ToListAsync(ct);

        var today = DateTime.UtcNow.Date;
        return rows
            .Select(c =>
            {
                var owner = !string.IsNullOrWhiteSpace(c.AssignedToId) ? c.AssignedToId! : c.CreatedById;
                var status = (c.StatusCode ?? string.Empty).ToUpperInvariant();
                var strictlyClosed = status.Contains("CLOTUR") || status.Contains("CLOSED");
                var closed = strictlyClosed || status == "VALIDATED" || status == "ARCHIVED"; // finished: neither open nor late
                var end = c.CompletedAt ?? c.UpdatedAt;
                return (Owner: owner, Closed: closed,
                    Late: !closed && c.Deadline.HasValue && c.Deadline.Value.Date < today,
                    Days: strictlyClosed && end.HasValue ? Math.Max(0, (end.Value - c.CreatedAt).TotalDays) : (double?)null);
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.Owner))
            .GroupBy(x => x.Owner!, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var days = g.Where(x => x.Days.HasValue).Select(x => x.Days!.Value).ToList();
                return new ClaimsByPersonDto(
                    g.Key, g.Count(x => !x.Closed), g.Count(x => x.Closed), g.Count(x => x.Late),
                    days.Count == 0 ? null : Math.Round(days.Average(), 1));
            })
            .ToList();
    }
}
