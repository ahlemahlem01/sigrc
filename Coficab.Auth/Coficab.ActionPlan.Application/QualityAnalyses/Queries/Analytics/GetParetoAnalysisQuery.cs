using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Analytics;

public record ParetoItemDto(
    string Category,
    int Frequency,
    double Percentage,
    double CumulativePercentage
);

public record ParetoReportDto(
    int TotalCauses,
    List<ParetoItemDto> Items
);

public record GetParetoAnalysisQuery() : IRequest<ParetoReportDto>;

public class GetParetoAnalysisQueryHandler : IRequestHandler<GetParetoAnalysisQuery, ParetoReportDto>
{
    private readonly IApplicationDbContext _context;

    public GetParetoAnalysisQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<ParetoReportDto> Handle(GetParetoAnalysisQuery request, CancellationToken cancellationToken)
    {
        // 1. Récupérer le nombre de causes non archivées groupées par catégorie 6M
        var rawGrouped = await _context.IshikawaCauses
            .AsNoTracking()
            .Where(c => !c.IsArchived)
            .GroupBy(c => c.Category)
            .Select(g => new
            {
                Category = g.Key.ToString(),
                Count = g.Count()
            })
            .OrderByDescending(x => x.Count)
            .ToListAsync(cancellationToken);

        int totalCauses = rawGrouped.Sum(x => x.Count);
        if (totalCauses == 0)
        {
            return new ParetoReportDto(0, new List<ParetoItemDto>());
        }

        // 2. Calculer les pourcentages cumulés (Principe de Pareto 80/20)
        var paretoItems = new List<ParetoItemDto>();
        double runningTotal = 0;

        foreach (var item in rawGrouped)
        {
            runningTotal += item.Count;
            double percentage = Math.Round((double)item.Count / totalCauses * 100, 2);
            double cumulativePercentage = Math.Round(runningTotal / totalCauses * 100, 2);

            paretoItems.Add(new ParetoItemDto(
                item.Category,
                item.Count,
                percentage,
                cumulativePercentage
            ));
        }

        return new ParetoReportDto(totalCauses, paretoItems);
    }
}