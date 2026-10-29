using Coficab.ActionPlan.Application.Dashboard;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

public record ExtendClaimDeadlineCommand(Guid ClaimId, DateTime NewDeadline, string Reason, string ActorId) : IRequest<DeadlineExtensionResult>;

/// <summary>
/// An administrator gives a late claim more time. The new date and the audit event are saved together (one SaveChanges):
/// no extension without its trace, and the previous date stays readable in the event.
/// </summary>
public class ExtendClaimDeadlineCommandHandler : IRequestHandler<ExtendClaimDeadlineCommand, DeadlineExtensionResult>
{
    private readonly IApplicationDbContext _context;
    private readonly INotificationService _notifications;

    public ExtendClaimDeadlineCommandHandler(IApplicationDbContext context, INotificationService notifications)
    {
        _context = context;
        _notifications = notifications;
    }

    public async Task<DeadlineExtensionResult> Handle(ExtendClaimDeadlineCommand request, CancellationToken cancellationToken)
    {
        var claim = await _context.Claims.FirstOrDefaultAsync(c => c.Id == request.ClaimId, cancellationToken);
        if (claim is null) return new("notFound");

        var status = claim.StatusCode ?? string.Empty;
        var open = !claim.IsArchived
                   && !status.Equals("CLOTUREE", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("CLOSED", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("CLOTURE", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("DRAFT", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("BROUILLON", StringComparison.OrdinalIgnoreCase);
        if (!open) return new("notOpen");

        var newDeadline = DateTime.SpecifyKind(request.NewDeadline.Date, DateTimeKind.Utc);
        var code = DeadlineExtensionRules.Check(claim.Deadline, newDeadline, DateTime.UtcNow, request.Reason);
        if (code is not null) return new(code);

        var old = claim.Deadline!.Value;
        claim.Deadline = newDeadline;
        claim.UpdatedAt = DateTime.UtcNow;
        claim.UpdatedById = request.ActorId;

        _context.ClaimEvents.Add(new ClaimEvent
        {
            ClaimId = claim.Id,
            ActionType = "claim_deadline_extended",
            ActorId = request.ActorId,
            Detail = $"{claim.Title} · {DeadlineExtensionRules.Describe(old, newDeadline, request.Reason)}",
            CreatedAt = DateTime.UtcNow,
        });

        await _context.SaveChangesAsync(cancellationToken);

        // the person in charge is told; the extension is already saved, so a failed notification never undoes it
        var assignee = claim.AssignedToId;
        if (!string.IsNullOrWhiteSpace(assignee) && !string.Equals(assignee, request.ActorId, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                await _notifications.NotifyAsync(
                    assignee,
                    "claim_deadline_extended",
                    "Échéance prolongée",
                    DeadlineExtensionRules.NotificationMessage(claim.Title, old, newDeadline, request.Reason),
                    actionPlanId: null,
                    linkPath: $"/pages/front/my-claims?claimId={claim.Id}",
                    claimId: claim.Id);
            }
            catch
            {
                // best effort
            }
        }

        return new(null, old, newDeadline, DeadlineExtensionRules.ExtraDays(old, newDeadline));
    }
}
