using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.DomainEvents.Handlers;

/// <summary>
/// À la clôture d'une réclamation, clôture toutes les CAPA encore ouvertes liées.
/// Évite l'incohérence « plan En cours » ↔ « dossier clôturé ».
/// </summary>
public sealed class CloseLinkedActionPlansOnClaimClosedHandler : INotificationHandler<ClaimClosedEvent>
{
    private readonly IActionPlanService _actionPlans;
    private readonly ILogger<CloseLinkedActionPlansOnClaimClosedHandler> _logger;

    public CloseLinkedActionPlansOnClaimClosedHandler(
        IActionPlanService actionPlans,
        ILogger<CloseLinkedActionPlansOnClaimClosedHandler> logger)
    {
        _actionPlans = actionPlans;
        _logger = logger;
    }

    public async Task Handle(ClaimClosedEvent notification, CancellationToken cancellationToken)
    {
        try
        {
            var closedBy = string.IsNullOrWhiteSpace(notification.ClosedById)
                ? "system"
                : notification.ClosedById!;

            var n = await _actionPlans.CloseOpenPlansForClaimAsync(
                notification.ClaimId,
                closedBy,
                "Clôturé suite à la clôture de la réclamation");

            if (n > 0)
                _logger.LogInformation(
                    "Closed {Count} open CAPA(s) for claim {ClaimId}",
                    n, notification.ClaimId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to close linked CAPAs for claim {ClaimId}",
                notification.ClaimId);
        }
    }
}
