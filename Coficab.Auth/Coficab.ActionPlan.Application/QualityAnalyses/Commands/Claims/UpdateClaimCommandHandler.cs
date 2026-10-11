using Coficab.ActionPlan.Application.DomainEvents;
using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

public class UpdateClaimCommandHandler : IRequestHandler<UpdateClaimCommand, bool>
{
    private readonly IApplicationDbContext _context;
    private readonly INotificationBroadcaster _realtime;
    private readonly ISemanticSearchService _semanticSearch;
    private readonly IDomainEventPublisher _events;

    public UpdateClaimCommandHandler(
        IApplicationDbContext context,
        INotificationBroadcaster realtime,
        ISemanticSearchService semanticSearch,
        IDomainEventPublisher events)
    {
        _context = context;
        _realtime = realtime;
        _semanticSearch = semanticSearch;
        _events = events;
    }

    public async Task<bool> Handle(UpdateClaimCommand request, CancellationToken cancellationToken)
    {
        var claim = await _context.Claims
            .FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken);
        if (claim == null)
            return false;

        var previousStatus = claim.StatusCode;
        var statusChanged = false;
        var justClosed = false;

        if (!string.IsNullOrWhiteSpace(request.Title)) claim.Title = request.Title;
        if (!string.IsNullOrWhiteSpace(request.ClientId)) claim.ClientId = request.ClientId;
        if (!string.IsNullOrWhiteSpace(request.DefectType))
            claim.DefectType = (await DefectTypeResolver.LoadAsync(_context, cancellationToken)).Resolve(request.DefectType);
        if (!string.IsNullOrWhiteSpace(request.LotNumber)) claim.LotNumber = request.LotNumber;
        if (!string.IsNullOrWhiteSpace(request.SerialNumber)) claim.SerialNumber = request.SerialNumber;
        if (request.Description != null) claim.Description = request.Description;
        if (!string.IsNullOrWhiteSpace(request.Severity)) claim.Severity = request.Severity;

        if (!string.IsNullOrWhiteSpace(request.StatusCode))
        {
            claim.StatusCode = request.StatusCode;
            CompletionTracking.ApplyClaimCompletion(claim, previousStatus);
            statusChanged = !string.Equals(previousStatus, claim.StatusCode, StringComparison.OrdinalIgnoreCase);
            justClosed = statusChanged
                && CompletionTracking.IsClosedClaimStatus(claim.StatusCode)
                && !CompletionTracking.IsClosedClaimStatus(previousStatus);

            if (CompletionTracking.IsClosedClaimStatus(claim.StatusCode))
            {
                var eightD = await _context.EightDDossiers
                    .FirstOrDefaultAsync(d => d.ClaimId == claim.Id && !d.IsArchived, cancellationToken);
                if (eightD != null
                    && !string.Equals(eightD.StatusCode, "CLOSED", StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(eightD.StatusCode, "VALIDATED", StringComparison.OrdinalIgnoreCase))
                {
                    eightD.StatusCode = "CLOSED";
                    eightD.CurrentStep = 8;
                    eightD.ClosedAt ??= claim.CompletedAt ?? DateTime.UtcNow;
                    eightD.UpdatedAt = DateTime.UtcNow;
                    eightD.UpdatedBy = request.UpdatedById.ToString();
                }
            }
        }

        if (request.ProducedQuantity.HasValue) claim.ProducedQuantity = request.ProducedQuantity;
        if (request.DefectiveQuantity.HasValue) claim.DefectiveQuantity = request.DefectiveQuantity;
        claim.UpdatedAt = DateTime.UtcNow;
        claim.UpdatedById = request.UpdatedById.ToString();
        await _context.SaveChangesAsync(cancellationToken);

        try { await _semanticSearch.UpsertClaimAsync(claim, cancellationToken); }
        catch { /* embedding is best-effort */ }

        if (statusChanged)
        {
            var recipients = new List<string>();
            if (!string.IsNullOrWhiteSpace(claim.AssignedToId)) recipients.Add(claim.AssignedToId);
            if (!string.IsNullOrWhiteSpace(claim.CreatedById)) recipients.Add(claim.CreatedById);
            await _realtime.SendDossierStatusChangedAsync(
                new DossierRealtimeEvent("claim", claim.Id, null, claim.StatusCode, claim.Title, claim.AssignedToId),
                recipients,
                includeAdmins: true);
        }

        if (justClosed)
        {
            try
            {
                await _events.PublishAsync(new ClaimClosedEvent(
                    claim.Id,
                    claim.DefectType,
                    claim.ProductionLine,
                    claim.Severity,
                    claim.AssignedToId,
                    claim.CreatedById,
                    claim.CompletedAt,
                    claim.IsOnTime,
                    request.UpdatedById.ToString(),
                    DateTime.UtcNow), cancellationToken);
            }
            catch { /* domain events best-effort */ }
        }

        return true;
    }
}
