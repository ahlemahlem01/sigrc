using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

public enum ArchiveClaimResult { Done, NotFound, Unchanged, HasOpenPlans }

/// <summary>
/// Archives a claim (hidden from every list, kept in the database) or restores it.
/// A claim whose CAPA plan is still open cannot be archived: the plan would lose its origin.
/// </summary>
public record ArchiveClaimCommand(Guid ClaimId, bool Archive, string UserId) : IRequest<ArchiveClaimResult>;

public class ArchiveClaimCommandHandler : IRequestHandler<ArchiveClaimCommand, ArchiveClaimResult>
{
    private readonly IApplicationDbContext _context;

    public ArchiveClaimCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<ArchiveClaimResult> Handle(ArchiveClaimCommand request, CancellationToken cancellationToken)
    {
        var claim = await _context.Claims
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == request.ClaimId, cancellationToken);
        if (claim == null) return ArchiveClaimResult.NotFound;
        if (claim.IsArchived == request.Archive) return ArchiveClaimResult.Unchanged;

        if (request.Archive)
        {
            var openPlan = await _context.ActionPlans
                .AsNoTracking()
                .AnyAsync(p => p.ClaimId == claim.Id && !p.IsArchived && p.Status != ActionPlanStatus.Closed, cancellationToken);
            if (openPlan) return ArchiveClaimResult.HasOpenPlans;
        }

        claim.IsArchived = request.Archive;
        claim.UpdatedAt = DateTime.UtcNow;
        claim.UpdatedById = request.UserId;
        await _context.SaveChangesAsync(cancellationToken);
        await ClaimAudit.RecordAsync(_context, claim.Id, request.Archive ? "claim_archived" : "claim_restored", request.UserId, claim.Title, cancellationToken);
        return ArchiveClaimResult.Done;
    }
}
