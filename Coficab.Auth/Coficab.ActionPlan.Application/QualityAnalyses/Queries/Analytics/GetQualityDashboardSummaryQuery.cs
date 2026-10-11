using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Analytics;

public record QualityDashboardSummaryDto(
    int TotalFiveWhyAnalyses,
    int ValidatedAnalyses,
    int PendingValidationAnalyses,
    int RejectedAnalyses,
    int TotalIshikawaCausesCount
);

public record GetQualityDashboardSummaryQuery() : IRequest<QualityDashboardSummaryDto>;

public class GetQualityDashboardSummaryQueryHandler : IRequestHandler<GetQualityDashboardSummaryQuery, QualityDashboardSummaryDto>
{
    private readonly IApplicationDbContext _context;

    public GetQualityDashboardSummaryQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<QualityDashboardSummaryDto> Handle(GetQualityDashboardSummaryQuery request, CancellationToken cancellationToken)
    {
        var fiveWhyStats = await _context.FiveWhyAnalyses
            .AsNoTracking()
            .Where(a => !a.IsArchived)
            .GroupBy(a => a.StatusCode)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        int totalCauses = await _context.IshikawaCauses
            .AsNoTracking()
            .CountAsync(c => !c.IsArchived, cancellationToken);

        int total = fiveWhyStats.Sum(s => s.Count);
        int validated = fiveWhyStats.FirstOrDefault(s => s.Status == "VALIDATED")?.Count ?? 0;
        int pending = fiveWhyStats.FirstOrDefault(s => s.Status == "DRAFT")?.Count ?? 0;
        int rejected = fiveWhyStats.FirstOrDefault(s => s.Status == "REJECTED")?.Count ?? 0;

        return new QualityDashboardSummaryDto(total, validated, pending, rejected, totalCauses);
    }
}