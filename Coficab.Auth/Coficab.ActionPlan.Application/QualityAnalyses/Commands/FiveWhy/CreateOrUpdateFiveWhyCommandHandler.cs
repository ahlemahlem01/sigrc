using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;

/// <summary>
/// Thrown when saving a 5-Why analysis fails because of a data validation
/// problem at the database level (e.g. a field too long for its column).
/// Distinct from an unexpected/unhandled failure so the API layer can
/// return a clean 400 instead of a raw 500.
/// </summary>
public class FiveWhySaveValidationException : Exception
{
    public FiveWhySaveValidationException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

public class CreateOrUpdateFiveWhyCommandHandler : IRequestHandler<CreateOrUpdateFiveWhyCommand, Guid>
{
    private readonly IApplicationDbContext _context;

    public CreateOrUpdateFiveWhyCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Guid> Handle(CreateOrUpdateFiveWhyCommand request, CancellationToken cancellationToken)
    {
        var existingAnalysis = await _context.FiveWhyAnalyses
            .Include(a => a.Steps)
            .FirstOrDefaultAsync(a => a.ClaimId == request.ClaimId, cancellationToken);

        string userIdString = request.UserId?.ToString() ?? string.Empty;

        if (existingAnalysis == null)
        {
            var newAnalysis = new FiveWhyAnalysis
            {
                Id = Guid.NewGuid(),
                ClaimId = request.ClaimId,
                ProblemStatement = request.ProblemStatement,
                RootCause = request.RootCause,
                RootCauseOccurrence = request.RootCauseOccurrence,
                RootCauseDetection = request.RootCauseDetection,
                StatusCode = request.StatusCode ?? "DRAFT",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = userIdString,
                Steps = request.Steps.Select(s => new FiveWhyStep
                {
                    StepNumber = s.StepNumber,
                    BranchType = NormalizeBranch(s.BranchType),
                    Question = s.Question,
                    Answer = s.Answer
                }).ToList()
            };

            _context.FiveWhyAnalyses.Add(newAnalysis);
            await SaveChangesSafelyAsync(cancellationToken);
            return newAnalysis.Id;
        }

        // Update existing record
        existingAnalysis.ProblemStatement = request.ProblemStatement;
        existingAnalysis.RootCause = request.RootCause;
        existingAnalysis.LastModifiedAt = DateTime.UtcNow;
        existingAnalysis.LastModifiedBy = userIdString;
        existingAnalysis.RootCauseOccurrence = request.RootCauseOccurrence;
        existingAnalysis.RootCauseDetection = request.RootCauseDetection;
        var previousStatus = existingAnalysis.StatusCode;
        existingAnalysis.StatusCode = request.StatusCode ?? existingAnalysis.StatusCode;

        _context.FiveWhySteps.RemoveRange(existingAnalysis.Steps);
        existingAnalysis.Steps = request.Steps.Select(s => new FiveWhyStep
        {
            StepNumber = s.StepNumber,
            BranchType = NormalizeBranch(s.BranchType),
            Question = s.Question,
            Answer = s.Answer
        }).ToList();

        await SaveChangesSafelyAsync(cancellationToken);
        if (!string.Equals(previousStatus, existingAnalysis.StatusCode, StringComparison.OrdinalIgnoreCase)
            && (existingAnalysis.StatusCode ?? string.Empty).ToUpperInvariant().Contains("PENDING"))
            await Coficab.ActionPlan.Application.QualityAnalyses.ClaimAudit.RecordAsync(
                _context, request.ClaimId, "fivewhy_submitted", userIdString, null, cancellationToken);
        return existingAnalysis.Id;
    }

    private static string NormalizeBranch(string? branch) =>
        string.Equals(branch?.Trim(), "DETECTION", StringComparison.OrdinalIgnoreCase) ? "DETECTION" : "OCCURRENCE";

    private async Task SaveChangesSafelyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            // SQL Server reports a column overflow as error 2628 (or 8152 on older compatibility levels):
            // "String or binary data would be truncated". Detected by number and by text, whichever column overflowed.
            var inner = ex.InnerException;
            var isValueTooLong = inner is Microsoft.Data.SqlClient.SqlException { Number: 2628 or 8152 }
                                 || (inner?.Message ?? ex.Message).Contains("would be truncated", StringComparison.OrdinalIgnoreCase);

            var message = isValueTooLong
                ? "Un des champs saisis dépasse la longueur maximale autorisée. Veuillez raccourcir le texte (notamment la synthèse / cause racine) et réessayer."
                : "Échec de l'enregistrement : les données saisies ne respectent pas les contraintes de la base de données.";

            throw new FiveWhySaveValidationException(message, ex);
        }
    }
}