using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

// 1. Query Definition
public record GetClaimByIdQuery(Guid Id) : IRequest<Claim?>;

// 2. Query Handler
public class GetClaimByIdQueryHandler : IRequestHandler<GetClaimByIdQuery, Claim?>
{
    private readonly IApplicationDbContext _context;

    public GetClaimByIdQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Claim?> Handle(GetClaimByIdQuery request, CancellationToken cancellationToken)
    {
        var claim = await _context.Claims
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken);
        if (claim != null)
            await ClaimVisibility.FillAsync(_context, new List<Claim> { claim }, cancellationToken);
        return claim;
    }
}