using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.DomainEvents.Handlers;

/// <summary>
/// Attribue des badges automatiques à la clôture d'une réclamation / CAPA.
/// </summary>
public sealed class UpdateBadgeOnCompletionHandler :
    INotificationHandler<ClaimClosedEvent>,
    INotificationHandler<ActionPlanCompletedEvent>
{
    private readonly IBadgeService _badges;
    private readonly ILogger<UpdateBadgeOnCompletionHandler> _logger;

    public UpdateBadgeOnCompletionHandler(
        IBadgeService badges,
        ILogger<UpdateBadgeOnCompletionHandler> logger)
    {
        _badges = badges;
        _logger = logger;
    }

    public async Task Handle(ClaimClosedEvent notification, CancellationToken cancellationToken)
    {
        var userId = FirstNonEmpty(notification.AssignedToId, notification.ClosedById, notification.CreatedById);
        if (string.IsNullOrWhiteSpace(userId)) return;

        // Speed tiers, streaks, perfect quarters and reliability all come from the employee's closed claims (BadgeRules).
        try
        {
            await _badges.AwardEarnedAsync(userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Badge evaluation failed for {UserId}", userId);
        }
    }

    public async Task Handle(ActionPlanCompletedEvent notification, CancellationToken cancellationToken)
    {
        var userId = FirstNonEmpty(notification.AssignedToId, notification.ClosedById, notification.OwnerId);
        if (string.IsNullOrWhiteSpace(userId)) return;

        await TryAwardAsync(userId, new AwardBadgeDto
        {
            Category = "first_plan",
            Name = "Premier plan CAPA",
            Description = "Premier plan d'actions clôturé.",
            Icon = "🏅",
            Color = "#2563eb",
            PlanId = notification.ActionPlanId,
            PlanTitle = notification.Title,
        });

        if (notification.IsOnTime == true)
        {
            await TryAwardAsync(userId, new AwardBadgeDto
            {
                Category = "speed",
                Name = "CAPA dans les délais",
                Description = "Plan d'actions clôturé avant la date limite.",
                Icon = "⚡",
                Color = "#16a34a",
                PlanId = notification.ActionPlanId,
                PlanTitle = notification.Title,
            });
        }
    }

    private async Task TryAwardAsync(string userId, AwardBadgeDto dto)
    {
        try
        {
            await _badges.AwardBadgeAsync(userId, dto);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Badge award failed for {UserId} / {Category}", userId, dto.Category);
        }
    }

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
}
