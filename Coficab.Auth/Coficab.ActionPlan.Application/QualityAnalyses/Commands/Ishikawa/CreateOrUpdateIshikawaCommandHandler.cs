using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

public class CreateOrUpdateIshikawaCommandHandler : IRequestHandler<CreateOrUpdateIshikawaCommand, bool>
{
    private readonly IApplicationDbContext _context;

    public CreateOrUpdateIshikawaCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<bool> Handle(CreateOrUpdateIshikawaCommand request, CancellationToken cancellationToken)
    {
        // 1. Récupérer les causes existantes non archivées pour cette réclamation
        var existingCauses = await _context.IshikawaCauses
            .Where(c => c.ClaimId == request.ClaimId && !c.IsArchived)
            .ToListAsync(cancellationToken);

        // 2. Traçabilité & Archivage : Passer les anciennes causes à IsArchived = true (Soft-delete)
        if (existingCauses.Any())
        {
            foreach (var oldCause in existingCauses)
            {
                oldCause.IsArchived = true;
                oldCause.ArchivedAt = DateTime.UtcNow;
                oldCause.ArchivedBy = request.UserId;
                oldCause.ArchiveReason = "Mise à jour du diagramme d'Ishikawa";
            }
            _context.IshikawaCauses.UpdateRange(existingCauses);
        }

        // 3. Insérer le nouvel ensemble de causes
        var newCauses = request.Causes.Select(c => new IshikawaCause
        {
            Id = Guid.NewGuid(),
            ClaimId = request.ClaimId,
            Category = c.Category,
            CauseDescription = c.CauseDescription,
            IsRootCause = c.IsRootCause,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.UserId,
            IsArchived = false
        }).ToList();

        if (newCauses.Any())
        {
            await _context.IshikawaCauses.AddRangeAsync(newCauses, cancellationToken);
        }

        await _context.SaveChangesAsync(cancellationToken);
        await Coficab.ActionPlan.Application.QualityAnalyses.ClaimAudit.RecordAsync(
            _context, request.ClaimId, "ishikawa_updated", request.UserId, $"{newCauses.Count} / {existingCauses.Count}", cancellationToken);
        return true;
    }
}