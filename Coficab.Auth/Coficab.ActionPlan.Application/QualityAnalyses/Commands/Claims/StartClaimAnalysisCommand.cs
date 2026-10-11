using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Coficab.ActionPlan.Application.Interfaces;

namespace Coficab.ActionPlan.Application.Claims.Commands.StartClaimAnalysis
{
    public record StartClaimAnalysisCommand(
        Guid ClaimId,
        string? ProductionLine = null,
        string? Shift = null,
        string? AnalysisNotes = null
    ) : IRequest<bool>;

    public class StartClaimAnalysisCommandHandler : IRequestHandler<StartClaimAnalysisCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public StartClaimAnalysisCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(StartClaimAnalysisCommand request, CancellationToken cancellationToken)
        {
            var claim = await _context.Claims.FirstOrDefaultAsync(c => c.Id == request.ClaimId, cancellationToken);
            if (claim == null) return false;

            // Transition early statuses -> EN_ANALYSE the first time analysis starts.
            var status = claim.StatusCode ?? string.Empty;
            if (string.Equals(status, "OUVERTE", StringComparison.OrdinalIgnoreCase)
                || string.Equals(status, "ASSIGNED", StringComparison.OrdinalIgnoreCase)
                || string.Equals(status, "OPEN", StringComparison.OrdinalIgnoreCase)
                || string.Equals(status, "DRAFT", StringComparison.OrdinalIgnoreCase))
            {
                claim.StatusCode = "EN_ANALYSE";
            }

            // Persistance des champs de traçabilité
            if (request.ProductionLine != null) claim.ProductionLine = request.ProductionLine;
            if (request.Shift != null) claim.Shift = request.Shift;
            if (request.AnalysisNotes != null) claim.AnalysisNotes = request.AnalysisNotes;

            claim.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}