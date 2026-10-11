using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using MediatR;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

public record EstimateClaimResolutionQuery(string? DefectType, string? Severity)
    : IRequest<ClaimResolutionEstimateDto?>;

public class EstimateClaimResolutionQueryHandler
    : IRequestHandler<EstimateClaimResolutionQuery, ClaimResolutionEstimateDto?>
{
    private readonly IClaimResolutionEstimateService _estimator;

    public EstimateClaimResolutionQueryHandler(IClaimResolutionEstimateService estimator)
    {
        _estimator = estimator;
    }

    public Task<ClaimResolutionEstimateDto?> Handle(
        EstimateClaimResolutionQuery request,
        CancellationToken cancellationToken)
        => _estimator.EstimateAsync(request.DefectType, request.Severity, cancellationToken);
}
