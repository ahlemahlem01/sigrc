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

    /// <summary>
    /// A claim assigned longer ago than this and still open is stale (forgotten, test data), not current workload.
    /// An operational rule, not a tuned value.
    /// </summary>
    public const int OpenWindowDays = 90;

    public static double SmoothedRate(int onTime, int closed, double prior) =>
        (onTime + prior * Smoothing) / (closed + Smoothing);

    /// <summary>
    /// Team average used as the prior (share of on-time claims among all known outcomes), measured on the data.
    /// Only a system with fewer than <see cref="TeamPriorTimeline.MinOutcomes"/> known outcomes falls back to
    /// <see cref="TeamPriorTimeline.DefaultPrior"/>; every candidate then shares it, so the ranking is unaffected.
    /// </summary>
    public static double TeamPrior(IEnumerable<ClaimOutcome> claims)
    {
        int known = 0, onTime = 0;
        foreach (var c in claims)
        {
            if (c.IsOnTime == null) continue;
            known++;
            if (c.IsOnTime == true) onTime++;
        }
        return known < TeamPriorTimeline.MinOutcomes ? TeamPriorTimeline.DefaultPrior : (double)onTime / known;
    }

    /// <summary>
    /// Team on-time share as it was at a given moment: only claims completed before that moment. Built once, queried
    /// per training row, so the prior of a row never contains its own outcome or anything later.
    /// </summary>
    public sealed class TeamPriorTimeline
    {
        /// <summary>Below this many known outcomes a team average is too unstable to be used.</summary>
        public const int MinOutcomes = 30;
        /// <summary>Only used when the whole system has fewer than <see cref="MinOutcomes"/> known outcomes.</summary>
        public const double DefaultPrior = 0.75;

        private readonly DateTime[] _completedAt;
        private readonly int[] _onTimeCumulative;

        public TeamPriorTimeline(IEnumerable<ClaimOutcome> claims)
        {
            var known = claims.Where(c => c.IsOnTime != null && c.CompletedAt != null)
                .OrderBy(c => c.CompletedAt!.Value).ToList();
            _completedAt = known.Select(c => c.CompletedAt!.Value).ToArray();
            _onTimeCumulative = new int[known.Count];
            var running = 0;
            for (var i = 0; i < known.Count; i++)
            {
                if (known[i].IsOnTime == true) running++;
                _onTimeCumulative[i] = running;
            }
        }

        /// <summary>The team average at that moment, or null when fewer than <see cref="MinOutcomes"/> outcomes were known (the row is then not used for training).</summary>
        public double? At(DateTime moment)
        {
            var lo = 0;
            var hi = _completedAt.Length;
            while (lo < hi)
            {
                var mid = (lo + hi) / 2;
                if (_completedAt[mid] < moment) lo = mid + 1; else hi = mid;
            }
            return lo < MinOutcomes ? null : (double)_onTimeCumulative[lo - 1] / lo;
        }
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
            if (c.AssignedAt <= current.AssignedAt && c.AssignedAt > current.AssignedAt.AddDays(-OpenWindowDays)
                && (c.CompletedAt == null || c.CompletedAt > current.AssignedAt))
                open++;
        }
        return new EmployeeHistoryValues(SmoothedRate(onTime, closed, prior), closed, open);
    }

    /// <summary>The employee's history now (used to score candidates for a new claim).</summary>
    public static EmployeeHistoryValues AsOfNow(IReadOnlyList<ClaimOutcome> userClaims, double prior, DateTime? nowUtc = null)
    {
        var since = (nowUtc ?? DateTime.UtcNow).AddDays(-OpenWindowDays);
        int closed = 0, onTime = 0, open = 0;
        foreach (var c in userClaims)
        {
            if (c.IsOnTime != null)
            {
                closed++;
                if (c.IsOnTime == true) onTime++;
            }
            if (c.CompletedAt == null && c.AssignedAt > since) open++;
        }
        return new EmployeeHistoryValues(SmoothedRate(onTime, closed, prior), closed, open);
    }

    public static double? AllocatedDays(DateTime assignedAt, DateTime? deadline) =>
        deadline == null ? null : Math.Max(0, (deadline.Value - assignedAt).TotalDays);
}
