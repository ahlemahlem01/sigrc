using Coficab.ActionPlan.Core.Entities;
using MediatR;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

public record IshikawaCauseInputDto(
    IshikawaCategory Category,
    string CauseDescription,
    bool IsRootCause
);

public record CreateOrUpdateIshikawaCommand(
    Guid ClaimId,
    string UserId,
    List<IshikawaCauseInputDto> Causes
) : IRequest<bool>;