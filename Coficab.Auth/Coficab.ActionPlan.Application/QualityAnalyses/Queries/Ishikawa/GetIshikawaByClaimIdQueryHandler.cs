using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Claims;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Ishikawa;

public class GetIshikawaByClaimIdQueryHandler : IRequestHandler<GetIshikawaByClaimIdQuery, IshikawaDetailsDto?>
{
    private readonly IApplicationDbContext _context;

    public GetIshikawaByClaimIdQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IshikawaDetailsDto?> Handle(GetIshikawaByClaimIdQuery request, CancellationToken cancellationToken)
    {
        // 1. Fetch active causes for the specified claim
        var causes = await _context.IshikawaCauses
            .Where(c => c.ClaimId == request.ClaimId && !c.IsArchived)
            .ToListAsync(cancellationToken);

        if (!causes.Any())
            return null;

        // 2. Group causes by the IshikawaCategory enum values
        var categories = causes
            .GroupBy(c => c.Category)
            .Select(g => new IshikawaCategoryDto
            {
                CategoryName = g.Key.ToString(),
                Causes = g.Select(c => new IshikawaCauseDto
                {
                    Id = c.Id,
                    Text = c.CauseDescription,
                    IsRootCause = c.IsRootCause
                }).ToList()
            })
            .ToList();

        // 3. Construct and return the DTO
        var firstCause = causes.OrderBy(c => c.CreatedAt).First();

        return new IshikawaDetailsDto
        {
            ClaimId = request.ClaimId,
            Categories = categories,
            CreatedAt = firstCause.CreatedAt,
            CreatedBy = firstCause.CreatedBy
        };
    }
}