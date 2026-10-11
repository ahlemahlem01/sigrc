using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using ActionPlanEntity = Coficab.ActionPlan.Core.Entities.ActionPlan;

namespace Coficab.ActionPlan.Core.Common;

/// <summary>
/// Applies / clears CompletedAt + IsOnTime when a Claim or ActionPlan is closed.
/// </summary>
public static class CompletionTracking
{
    public static bool IsClosedClaimStatus(string? statusCode)
    {
        if (string.IsNullOrWhiteSpace(statusCode)) return false;
        var s = statusCode.Trim().ToUpperInvariant();
        return s is "CLOTUREE" or "CLOSED" or "CLOTURÉE" or "CLOTURE";
    }

    public static bool IsClosedPlanStatus(ActionPlanStatus status)
        => status == ActionPlanStatus.Closed;

    /// <summary>
    /// Call after StatusCode has been updated. Sets CompletedAt/IsOnTime on first close;
    /// clears them if the claim leaves a closed status.
    /// </summary>
    public static void ApplyClaimCompletion(Claim claim, string? previousStatusCode)
    {
        var wasClosed = IsClosedClaimStatus(previousStatusCode);
        var isClosed = IsClosedClaimStatus(claim.StatusCode);

        if (isClosed && !wasClosed)
        {
            var completedAt = DateTime.UtcNow;
            claim.CompletedAt = completedAt;
            claim.IsOnTime = claim.Deadline.HasValue
                ? completedAt.Date <= claim.Deadline.Value.Date
                : null;
        }
        else if (!isClosed && wasClosed)
        {
            claim.CompletedAt = null;
            claim.IsOnTime = null;
        }
        else if (isClosed && wasClosed && !claim.CompletedAt.HasValue)
        {
            var completedAt = DateTime.UtcNow;
            claim.CompletedAt = completedAt;
            claim.IsOnTime = claim.Deadline.HasValue
                ? completedAt.Date <= claim.Deadline.Value.Date
                : null;
        }
    }

    /// <summary>
    /// Call after Status has been updated. Sets CompletedAt/IsOnTime on first close;
    /// clears them if the plan leaves Closed.
    /// </summary>
    public static void ApplyActionPlanCompletion(ActionPlanEntity plan, ActionPlanStatus previousStatus)
    {
        var wasClosed = IsClosedPlanStatus(previousStatus);
        var isClosed = IsClosedPlanStatus(plan.Status);

        if (isClosed && !wasClosed)
        {
            var completedAt = DateTime.UtcNow;
            plan.CompletedAt = completedAt;
            plan.IsOnTime = plan.Deadline.HasValue
                ? completedAt.Date <= plan.Deadline.Value.Date
                : null;
            plan.Progress = 100;
        }
        else if (!isClosed && wasClosed)
        {
            plan.CompletedAt = null;
            plan.IsOnTime = null;
        }
        else if (isClosed && wasClosed)
        {
            if (!plan.CompletedAt.HasValue)
            {
                var completedAt = DateTime.UtcNow;
                plan.CompletedAt = completedAt;
                plan.IsOnTime = plan.Deadline.HasValue
                    ? completedAt.Date <= plan.Deadline.Value.Date
                    : null;
            }
            if (plan.Progress < 100)
                plan.Progress = 100;
        }
    }
}
