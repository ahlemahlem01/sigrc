using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.MlFeatures.Queries;

public record EmployeeStatsDto(string EmployeeId, double OnTimeRate, int ClosedCount, int OpenClaims);

/// <summary>Punctuality history of some employees as of now: the inputs of the recommendation model.</summary>
public record GetEmployeeStatsQuery(IReadOnlyList<string> EmployeeIds) : IRequest<IReadOnlyList<EmployeeStatsDto>>;

public class GetEmployeeStatsQueryHandler : IRequestHandler<GetEmployeeStatsQuery, IReadOnlyList<EmployeeStatsDto>>
{
    private const int MaxIds = 500;
    private readonly IApplicationDbContext _db;

    public GetEmployeeStatsQueryHandler(IApplicationDbContext db) => _db = db;

    public async Task<IReadOnlyList<EmployeeStatsDto>> Handle(GetEmployeeStatsQuery request, CancellationToken ct)
    {
        var ids = request.EmployeeIds
            .Where(i => !string.IsNullOrWhiteSpace(i))
            .Select(i => i.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxIds)
            .ToList();
        if (ids.Count == 0) return Array.Empty<EmployeeStatsDto>();

        var rows = await _db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.AssignedToId != null)
            .Select(c => new { c.Id, c.AssignedToId, c.AssignedAt, c.CreatedAt, c.Deadline, c.CompletedAt, c.IsOnTime })
            .ToListAsync(ct);

        var all = rows.Select(c => new ClaimOutcome(
            c.Id, c.AssignedToId!, c.AssignedAt ?? c.CreatedAt, c.Deadline, c.CompletedAt, c.IsOnTime)).ToList();
        var prior = EmployeeHistory.TeamPrior(all);
        var byUser = all.GroupBy(c => c.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<ClaimOutcome>)g.ToList(), StringComparer.OrdinalIgnoreCase);

        return ids.Select(id =>
        {
            var v = byUser.TryGetValue(id, out var claims)
                ? EmployeeHistory.AsOfNow(claims, prior)
                : new EmployeeHistoryValues(prior, 0, 0);
            return new EmployeeStatsDto(id, Math.Round(v.OnTimeRate, 4), v.ClosedCount, v.OpenClaims);
        }).ToList();
    }
}
