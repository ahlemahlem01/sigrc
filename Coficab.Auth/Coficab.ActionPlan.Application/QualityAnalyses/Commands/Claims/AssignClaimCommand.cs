using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

/// <summary>
/// Assign or reassign a claim to an employee. Sets status to ASSIGNED when
/// the claim is still in an early workflow state (DRAFT / OUVERTE / ASSIGNED).
/// </summary>
public record AssignClaimCommand(
    Guid ClaimId,
    string? AssignedToId,
    string? AssignedToName,
    Guid AssignedById
) : IRequest<bool>;

public class AssignClaimCommandHandler : IRequestHandler<AssignClaimCommand, bool>
{
    private static readonly HashSet<string> AssignableStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "DRAFT", "OUVERTE", "ASSIGNED", "OPEN"
    };

    private readonly IApplicationDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly INotificationBroadcaster _realtime;

    public AssignClaimCommandHandler(
        IApplicationDbContext context,
        INotificationService notificationService,
        INotificationBroadcaster realtime)
    {
        _context = context;
        _notificationService = notificationService;
        _realtime = realtime;
    }

    public async Task<bool> Handle(AssignClaimCommand request, CancellationToken cancellationToken)
    {
        var claim = await _context.Claims
            .FirstOrDefaultAsync(c => c.Id == request.ClaimId, cancellationToken);
        if (claim == null) return false;

        var newId = string.IsNullOrWhiteSpace(request.AssignedToId)
            ? null
            : request.AssignedToId.Trim();
        var oldId = claim.AssignedToId;

        if (string.Equals(oldId, newId, StringComparison.OrdinalIgnoreCase)
            && (newId != null || oldId == null))
        {
            // Same assignee — still refresh name if provided
            if (newId != null && !string.IsNullOrWhiteSpace(request.AssignedToName))
            {
                claim.AssignedToName = request.AssignedToName.Trim();
                await _context.SaveChangesAsync(cancellationToken);
            }
            return true;
        }

        string? newName = string.IsNullOrWhiteSpace(request.AssignedToName)
            ? null
            : request.AssignedToName.Trim();

        if (newId != null && newName == null)
        {
            var profile = await _context.UserProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == newId, cancellationToken);
            if (profile != null)
                newName = string.IsNullOrWhiteSpace(profile.Name) ? profile.Email : profile.Name;
        }

        claim.AssignedToId = newId;
        claim.AssignedToName = newId == null ? null : newName;
        claim.AssignedAt = newId == null ? null : DateTime.UtcNow;
        claim.UpdatedAt = DateTime.UtcNow;
        claim.UpdatedById = request.AssignedById == Guid.Empty
            ? null
            : request.AssignedById.ToString();

        if (newId != null && AssignableStatuses.Contains(claim.StatusCode ?? string.Empty))
        {
            claim.StatusCode = "ASSIGNED";
        }
        else if (newId == null
            && string.Equals(claim.StatusCode, "ASSIGNED", StringComparison.OrdinalIgnoreCase))
        {
            claim.StatusCode = "OUVERTE";
        }

        await _context.SaveChangesAsync(cancellationToken);
        await ClaimAudit.RecordAsync(
            _context, claim.Id, newId == null ? "claim_unassigned" : "claim_assigned",
            request.AssignedById == Guid.Empty ? null : request.AssignedById.ToString(),
            newId == null ? claim.Title : $"{claim.Title} · {(string.IsNullOrWhiteSpace(oldId) ? "—" : oldId)} → {claim.AssignedToName ?? newId}",
            cancellationToken);

        if (newId != null
            && !string.Equals(oldId, newId, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                await _notificationService.NotifyAsync(
                    newId,
                    "claim_assigned",
                    "Réclamation assignée",
                    $"La réclamation « {claim.Title} » vous a été assignée. Vous pouvez démarrer l'analyse (5 Why / Ishikawa / 8D).",
                    actionPlanId: null,
                    linkPath: $"/pages/front/my-claims?claimId={claim.Id}",
                    claimId: claim.Id);
            }
            catch
            {
                // Assignment already persisted — do not fail the request if notify fails.
            }
        }

        var recipients = new List<string>();
        if (!string.IsNullOrWhiteSpace(oldId)) recipients.Add(oldId);
        if (!string.IsNullOrWhiteSpace(newId)) recipients.Add(newId);
        if (!string.IsNullOrWhiteSpace(claim.CreatedById)) recipients.Add(claim.CreatedById);
        try
        {
            await _realtime.SendDossierStatusChangedAsync(
                new DossierRealtimeEvent("claim", claim.Id, null, claim.StatusCode ?? "ASSIGNED", claim.Title, claim.AssignedToId),
                recipients,
                includeAdmins: true);
        }
        catch
        {
            // Realtime is best-effort.
        }

        return true;
    }
}
