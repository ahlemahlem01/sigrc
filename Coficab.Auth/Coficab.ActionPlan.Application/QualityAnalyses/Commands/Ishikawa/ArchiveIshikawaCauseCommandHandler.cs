using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

public class ArchiveIshikawaCauseCommandHandler : IRequestHandler<ArchiveIshikawaCauseCommand, bool>
{
    private readonly IApplicationDbContext _context;

    public ArchiveIshikawaCauseCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<bool> Handle(ArchiveIshikawaCauseCommand request, CancellationToken cancellationToken)
    {
        var cause = await _context.IshikawaCauses
            .FirstOrDefaultAsync(c => c.Id == request.CauseId, cancellationToken);

        if (cause == null)
            return false;

        // Archive fields
        cause.IsArchived = true;
        cause.ArchivedAt = DateTime.UtcNow;
        cause.ArchivedBy = request.ArchivedBy;
        cause.ArchiveReason = request.ArchiveReason;

        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }
}