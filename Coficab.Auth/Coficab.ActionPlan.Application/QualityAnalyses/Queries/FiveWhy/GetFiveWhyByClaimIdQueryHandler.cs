using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Claims;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.FiveWhy;

public class GetFiveWhyByClaimIdQueryHandler : IRequestHandler<GetFiveWhyByClaimIdQuery, FiveWhyDetailsDto?>
{
    private readonly IApplicationDbContext _context;

    public GetFiveWhyByClaimIdQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<FiveWhyDetailsDto?> Handle(GetFiveWhyByClaimIdQuery request, CancellationToken cancellationToken)
    {
        var analysis = await _context.FiveWhyAnalyses
            .Include(f => f.Steps)
            .Where(f => !f.IsArchived)
            .FirstOrDefaultAsync(f => f.ClaimId == request.ClaimId, cancellationToken);

        if (analysis == null)
            return null;

        return new FiveWhyDetailsDto
        {
            Id = analysis.Id,
            ClaimId = analysis.ClaimId,
            ProblemStatement = analysis.ProblemStatement,
            RootCause = analysis.RootCause,
            RootCauseOccurrence = analysis.RootCauseOccurrence,
            RootCauseDetection = analysis.RootCauseDetection,
            StatusCode = analysis.StatusCode,
            IsValidated = analysis.IsValidated,
            ValidatedBy = analysis.ValidatedBy,
            ValidatedAt = analysis.ValidatedAt,
            CreatedAt = analysis.CreatedAt,
            CreatedBy = analysis.CreatedBy,
            Steps = analysis.Steps
                .OrderBy(s => s.BranchType == "DETECTION" ? 1 : 0)
                .ThenBy(s => s.StepNumber)
                .Select(s => new FiveWhyStepReadDto
                {
                    Id = s.Id,
                    StepNumber = s.StepNumber,
                    BranchType = s.BranchType,
                    Question = s.Question,
                    Answer = s.Answer
                })
                .ToList()
        };
    }
}