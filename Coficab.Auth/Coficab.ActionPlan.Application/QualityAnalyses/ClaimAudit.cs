using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.QualityAnalyses;

/// <summary>Writes the audit events of claims. Best effort: a failure here never breaks the action that was audited.</summary>
public static class ClaimAudit
{
    public static async Task RecordAsync(IApplicationDbContext context, Guid claimId, string actionType, string? actorId, string? detail, CancellationToken ct)
    {
        try
        {
            context.ClaimEvents.Add(new ClaimEvent
            {
                ClaimId = claimId,
                ActionType = actionType,
                ActorId = string.IsNullOrWhiteSpace(actorId) ? "system" : actorId.Trim(),
                Detail = string.IsNullOrWhiteSpace(detail) ? null : (detail.Length > 1900 ? detail[..1900] : detail),
                CreatedAt = DateTime.UtcNow,
            });
            await context.SaveChangesAsync(ct);
        }
        catch
        {
            // the audit must not break the claim flow
        }
    }
}
