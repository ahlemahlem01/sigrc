using Coficab.ActionPlan.Core.Entities;
using MediatR;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

public record CreateIshikawaCauseCommand(
    Guid ClaimId,
    IshikawaCategory Category,
    string CauseDescription,
    bool IsRootCause,
    string CreatedBy
) : IRequest<Guid>;