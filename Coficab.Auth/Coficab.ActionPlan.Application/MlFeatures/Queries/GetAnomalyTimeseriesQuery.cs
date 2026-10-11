using Coficab.ActionPlan.Application.Interfaces;
using MediatR;

namespace Coficab.ActionPlan.Application.MlFeatures.Queries;

/// <summary>Une semaine ISO (lundi UTC) avec son compteur.</summary>
public record AnomalyWeekCountDto(
    DateTime WeekStart,
    string WeekLabel,
    int Count
);

/// <summary>Série temporelle pour une combinaison DefectType × ProductionLine.</summary>
public record AnomalySeriesDto(
    string DefectType,
    string ProductionLine,
    IReadOnlyList<AnomalyWeekCountDto> Weeks,
    int Total
);

public record AnomalyTimeseriesDto(
    DateTime From,
    DateTime To,
    int WeekCount,
    IReadOnlyList<string> WeekLabels,
    IReadOnlyList<AnomalySeriesDto> Series
);

public record GetAnomalyTimeseriesQuery(int Weeks = 12) : IRequest<AnomalyTimeseriesDto>;

public class GetAnomalyTimeseriesQueryHandler
    : IRequestHandler<GetAnomalyTimeseriesQuery, AnomalyTimeseriesDto>
{
    private readonly IAnomalyTimeseriesService _timeseries;

    public GetAnomalyTimeseriesQueryHandler(IAnomalyTimeseriesService timeseries)
    {
        _timeseries = timeseries;
    }

    public Task<AnomalyTimeseriesDto> Handle(
        GetAnomalyTimeseriesQuery request,
        CancellationToken cancellationToken)
        => _timeseries.GetTimeseriesAsync(request.Weeks, cancellationToken);
}
