using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

public class CreateIshikawaCauseCommandHandler : IRequestHandler<CreateIshikawaCauseCommand, Guid>
{
    private readonly IApplicationDbContext _context;

    public CreateIshikawaCauseCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Guid> Handle(CreateIshikawaCauseCommand request, CancellationToken cancellationToken)
    {
        var cause = new IshikawaCause
        {
            Id = Guid.NewGuid(),
            ClaimId = request.ClaimId,
            Category = request.Category,
            CauseDescription = request.CauseDescription,
            IsRootCause = request.IsRootCause,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.CreatedBy,
            IsArchived = false
        };

        _context.IshikawaCauses.Add(cause);
        await _context.SaveChangesAsync(cancellationToken);

        return cause.Id;
    }
}