using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using Coficab.ActionPlan.Application.ReferenceLists;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Kpi;

public record MonthlyClaimsDto(string Month, int Opened, int Closed);

/// <summary>PPM = defective parts per million produced, over the period (null when no production was recorded).</summary>
public record ClientPpmDto(string ClientId, int Claims, long DefectiveQuantity, long ProducedQuantity, double? Ppm);

public record DefectCountDto(string DefectType, int Claims, long DefectiveQuantity);

public record StatusCountDto(string Status, int Claims);

public record ClaimKpisDto(
    DateTime From,
    int Months,
    int TotalClaims,
    double? AverageTreatmentDays,
    int ClosedWithDates,
    List<MonthlyClaimsDto> ClaimsPerMonth,
    List<ClientPpmDto> PpmByClient,
    List<DefectCountDto> TopDefects,
    List<StatusCountDto> ByStatus);

public sealed record MonthCount(string Month, int Count);

public sealed record ClosedDates(DateTime Detection, DateTime Completed);

/// <summary>Raw rows of the KPI read model (filled by one round trip to the database).</summary>
public sealed record ClaimKpiRaw(
    List<MonthCount> Opened,
    List<MonthCount> Closed,
    List<ClientPpmDto> Clients,
    List<DefectCountDto> Defects,
    List<StatusCountDto> Statuses,
    List<ClosedDates> ClosedDates);

/// <summary>Heavy read model: aggregates computed by the database, not by loading every claim.</summary>
public interface IClaimKpiReader
{
    /// <param name="scopeClaimIds">null = every active claim; otherwise only these claims.</param>
    Task<ClaimKpiRaw> ReadAsync(DateTime from, IReadOnlyCollection<Guid>? scopeClaimIds, CancellationToken ct);
}

/// <summary>Claims KPIs of the specification: claims per month, average treatment time, PPM per client, top defects.</summary>
public record GetClaimKpisQuery(string? ScopeUserId, int Months = 12, IReadOnlyList<Guid>? OrganizationIds = null, Guid? DepartmentId = null) : IRequest<ClaimKpisDto>;

public class GetClaimKpisQueryHandler : IRequestHandler<GetClaimKpisQuery, ClaimKpisDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IClaimKpiReader _reader;

    public GetClaimKpisQueryHandler(IApplicationDbContext context, IClaimKpiReader reader)
    {
        _context = context;
        _reader = reader;
    }

    public async Task<ClaimKpisDto> Handle(GetClaimKpisQuery request, CancellationToken ct)
    {
        var months = Math.Clamp(request.Months, 1, 36);
        var today = DateTime.UtcNow;
        var from = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-(months - 1));

        List<Guid>? scope = null;
        if (!string.IsNullOrWhiteSpace(request.ScopeUserId) || request.OrganizationIds is { Count: > 0 } || request.DepartmentId != null)
        {
            IQueryable<Core.Entities.Claim> visible = _context.Claims.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(request.ScopeUserId))
                visible = await ClaimVisibility.ApplyAsync(_context, visible, request.ScopeUserId, ct);
            if (request.OrganizationIds is { Count: > 0 } orgIds)
                visible = await ClaimOrganizations.ApplyAsync(_context, visible, orgIds, ct);
            if (request.DepartmentId is { } departmentId)
                visible = await ClaimDepartments.ApplyAsync(_context, visible, departmentId, ct);
            scope = await visible.Select(c => c.Id).ToListAsync(ct);
        }

        var raw = await _reader.ReadAsync(from, scope, ct);
        var defectTypes = await DefectTypeResolver.LoadAsync(_context, ct);

        var opened = raw.Opened.ToDictionary(x => x.Month, x => x.Count);
        var closed = raw.Closed.ToDictionary(x => x.Month, x => x.Count);
        var perMonth = Enumerable.Range(0, months)
            .Select(i => from.AddMonths(i).ToString("yyyy-MM"))
            .Select(m => new MonthlyClaimsDto(m, opened.GetValueOrDefault(m), closed.GetValueOrDefault(m)))
            .ToList();

        var days = raw.ClosedDates.Select(d => (d.Completed - d.Detection).TotalDays).Where(d => d >= 0).ToList();

        return new ClaimKpisDto(
            from,
            months,
            raw.Statuses.Sum(s => s.Claims),
            days.Count == 0 ? null : Math.Round(days.Average(), 1),
            days.Count,
            perMonth,
            raw.Clients
                .Select(c => c with { Ppm = c.ProducedQuantity > 0 ? Math.Round(c.DefectiveQuantity * 1_000_000d / c.ProducedQuantity, 0) : null })
                .OrderByDescending(c => c.Ppm ?? -1).ThenByDescending(c => c.Claims).ToList(),
            raw.Defects
                .GroupBy(d => defectTypes.Resolve(d.DefectType))
                .Select(g => new DefectCountDto(g.Key, g.Sum(x => x.Claims), g.Sum(x => x.DefectiveQuantity)))
                .OrderByDescending(d => d.Claims).ThenBy(d => d.DefectType).Take(10).ToList(),
            raw.Statuses.OrderByDescending(s => s.Claims).ToList());
    }
}
