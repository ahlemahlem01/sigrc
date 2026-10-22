using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

public record SetClaimDeadlineCommand(Guid ClaimId, DateTime Deadline, Guid UpdatedById) : IRequest<bool>;

public class SetClaimDeadlineCommandHandler : IRequestHandler<SetClaimDeadlineCommand, bool>
{
    private readonly IApplicationDbContext _context;

    public SetClaimDeadlineCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<bool> Handle(SetClaimDeadlineCommand request, CancellationToken cancellationToken)
    {
        var claim = await _context.Claims
            .FirstOrDefaultAsync(c => c.Id == request.ClaimId, cancellationToken);
        if (claim == null) return false;

        // Explicit user action only — never called from create/estimate paths.
        claim.Deadline = DateTime.SpecifyKind(request.Deadline.Date, DateTimeKind.Utc);
        claim.UpdatedAt = DateTime.UtcNow;
        claim.UpdatedById = request.UpdatedById.ToString();

        // Refresh IsOnTime if already closed.
        if (claim.CompletedAt.HasValue)
        {
            claim.IsOnTime = claim.CompletedAt.Value.Date <= claim.Deadline.Value.Date;
        }

        await _context.SaveChangesAsync(cancellationToken);
        await ClaimAudit.RecordAsync(_context, claim.Id, "claim_deadline_set", request.UpdatedById.ToString(), $"{claim.Title} · {claim.Deadline:yyyy-MM-dd}", cancellationToken);
        return true;
    }
}
