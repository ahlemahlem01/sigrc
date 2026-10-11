namespace Coficab.ActionPlan.Application.MlFeatures;

/// <summary>One claim as seen by the employee-history features (nothing but dates, assignee and outcome).</summary>
public sealed record ClaimOutcome(
    Guid Id,
    string UserId,
    DateTime AssignedAt,
    DateTime? Deadline,
    DateTime? CompletedAt,
    bool? IsOnTime);

public sealed record EmployeeHistoryValues(double OnTimeRate, int ClosedCount, int OpenClaims);

/// <summary>
/// Employee history features for the "on time" model. They only use what was known at a given moment, so that a
/// training row never contains information from its own outcome or from the future.
/// </summary>
public static class EmployeeHistory
{
    /// <summary>Weight of the team average: an employee with few closed claims is pulled towards it.</summary>
    public const double Smoothing = 6;

    public static double SmoothedRate(int onTime, int closed, double prior) =>
        (onTime + prior * Smoothing) / (closed + Smoothing);

    /// <summary>Team average used as the prior (share of on-time claims among all known outcomes).</summary>
    public static double TeamPrior(IEnumerable<ClaimOutcome> claims)
    {
        int known = 0, onTime = 0;
        foreach (var c in claims)
        {
            if (c.IsOnTime == null) continue;
            known++;
            if (c.IsOnTime == true) onTime++;
        }
        return known == 0 ? 0.75 : (double)onTime / known;
    }

    /// <summary>The employee's history as it was when <paramref name="current"/> was assigned (the claim itself excluded).</summary>
    public static EmployeeHistoryValues AsOfAssignment(
        IReadOnlyList<ClaimOutcome> userClaims, ClaimOutcome current, double prior)
    {
        int closed = 0, onTime = 0, open = 0;
        foreach (var c in userClaims)
        {
            if (c.Id == current.Id) continue;
            if (c.IsOnTime != null && c.CompletedAt != null && c.CompletedAt < current.AssignedAt)
            {
                closed++;
                if (c.IsOnTime == true) onTime++;
            }
            if (c.AssignedAt <= current.AssignedAt && (c.CompletedAt == null || c.CompletedAt > current.AssignedAt))
                open++;
        }
        return new EmployeeHistoryValues(SmoothedRate(onTime, closed, prior), closed, open);
    }

    /// <summary>The employee's history now (used to score candidates for a new claim).</summary>
    public static EmployeeHistoryValues AsOfNow(IReadOnlyList<ClaimOutcome> userClaims, double prior)
    {
        int closed = 0, onTime = 0, open = 0;
        foreach (var c in userClaims)
        {
            if (c.IsOnTime != null)
            {
                closed++;
                if (c.IsOnTime == true) onTime++;
            }
            if (c.CompletedAt == null) open++;
        }
        return new EmployeeHistoryValues(SmoothedRate(onTime, closed, prior), closed, open);
    }

    public static double? AllocatedDays(DateTime assignedAt, DateTime? deadline) =>
        deadline == null ? null : Math.Max(0, (deadline.Value - assignedAt).TotalDays);
}
