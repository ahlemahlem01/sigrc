using MediatR;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

public record ArchiveIshikawaCauseCommand(
    Guid CauseId,
    string ArchivedBy,
    string? ArchiveReason = null
) : IRequest<bool>;