using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;

public class ValidateFiveWhyCommandHandler : IRequestHandler<ValidateFiveWhyCommand, bool>
{
    private readonly IApplicationDbContext _context;

    public ValidateFiveWhyCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<bool> Handle(ValidateFiveWhyCommand request, CancellationToken cancellationToken)
    {
        // Query by AnalysisId or ClaimId directly without using .HasValue or .Value
        var analysis = await _context.FiveWhyAnalyses
            .FirstOrDefaultAsync(a => a.Id == request.AnalysisId || a.ClaimId == request.ClaimId, cancellationToken);

        if (analysis == null)
        {
            return false;
        }

        if (request.IsApproved)
        {
            analysis.StatusCode = "VALIDATED";
        }
        else if (!string.IsNullOrEmpty(request.StatusCode))
        {
            analysis.StatusCode = request.StatusCode;
        }
        else
        {
            analysis.StatusCode = "DRAFT";
        }

        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }
}