using Coficab.ActionPlan.Core.DTOs.Claims;
using MediatR;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Ishikawa;

public record GetIshikawaByClaimIdQuery(Guid ClaimId) : IRequest<IshikawaDetailsDto?>;