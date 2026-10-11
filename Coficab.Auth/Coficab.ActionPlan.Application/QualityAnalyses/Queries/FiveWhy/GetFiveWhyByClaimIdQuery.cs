using Coficab.ActionPlan.Core.DTOs.Claims;
using MediatR;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.FiveWhy;

public record GetFiveWhyByClaimIdQuery(Guid ClaimId) : IRequest<FiveWhyDetailsDto?>;