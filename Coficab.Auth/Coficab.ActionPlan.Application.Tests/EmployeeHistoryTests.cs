using Coficab.ActionPlan.Application.MlFeatures;

namespace Coficab.ActionPlan.Application.Tests;

/// <summary>The history features must only use what was known when the claim was assigned.</summary>
public class EmployeeHistoryTests
{
    private static readonly DateTime T0 = new(2026, 1, 1, 8, 0, 0, DateTimeKind.Utc);

    private static ClaimOutcome Claim(int assignedDay, int? completedDay, bool? onTime, string user = "u1") =>
        new(Guid.NewGuid(), user, T0.AddDays(assignedDay), T0.AddDays(assignedDay + 10),
            completedDay == null ? null : T0.AddDays(completedDay.Value), onTime);

    [Fact]
    public void AsOfAssignment_IgnoresTheClaimItselfAndTheFuture()
    {
        var past = Claim(0, 5, true);
        var current = Claim(10, 20, false);
        var future = Claim(30, 35, true);
        var claims = new[] { past, current, future };

        var h = EmployeeHistory.AsOfAssignment(claims, current, prior: 0.75);

        Assert.Equal(1, h.ClosedCount);                 // only the claim completed before the assignment
        Assert.Equal(0, h.OpenClaims);                  // nothing else was open at that moment
        var expected = EmployeeHistory.SmoothedRate(1, 1, 0.75);
        Assert.Equal(expected, h.OnTimeRate, 6);
    }

    [Fact]
    public void AsOfAssignment_CountsClaimsStillOpenAtAssignmentAsWorkload()
    {
        var stillOpen = Claim(2, 15, true);              // assigned before, completed after
        var neverClosed = Claim(3, null, null);
        var current = Claim(10, 20, true);

        var h = EmployeeHistory.AsOfAssignment(new[] { stillOpen, neverClosed, current }, current, 0.75);

        Assert.Equal(2, h.OpenClaims);
        Assert.Equal(0, h.ClosedCount);
        Assert.Equal(0.75, h.OnTimeRate, 6);             // no history: the team average
    }

    [Fact]
    public void SmoothedRate_PullsSmallSamplesTowardsTheTeamAverage()
    {
        var one = EmployeeHistory.SmoothedRate(1, 1, 0.75);      // one on-time claim does not mean 100 %
        var many = EmployeeHistory.SmoothedRate(100, 100, 0.75);

        Assert.InRange(one, 0.75, 0.9);
        Assert.True(many > 0.95);
    }

    [Fact]
    public void AsOfNow_UsesAllOutcomesAndOpenClaims()
    {
        var claims = new[] { Claim(0, 5, true), Claim(1, 6, false), Claim(2, null, null) };

        var h = EmployeeHistory.AsOfNow(claims, 0.5, T0.AddDays(10));

        Assert.Equal(2, h.ClosedCount);
        Assert.Equal(1, h.OpenClaims);
    }

    [Fact]
    public void TeamPrior_IsMeasured_AndOnlyDefaultsOnAnAlmostEmptySystem()
    {
        Assert.Equal(0.75, EmployeeHistory.TeamPrior(Array.Empty<ClaimOutcome>()));
        Assert.Equal(0.75, EmployeeHistory.TeamPrior(new[] { Claim(0, 1, false), Claim(0, 1, false) }));   // too few outcomes
        var measured = Enumerable.Range(0, 40).Select(i => Claim(i, i + 1, i % 2 == 0)).ToList();
        Assert.Equal(0.5, EmployeeHistory.TeamPrior(measured));
    }

    [Fact]
    public void OpenClaims_IgnoreClaimsThatHaveBeenOpenForMoreThanTheWindow()
    {
        var stale = Claim(0, null, null);                // assigned long ago, never closed
        var recent = Claim(150, null, null);
        var current = Claim(200, 210, true);

        var asOfAssignment = EmployeeHistory.AsOfAssignment(new[] { stale, recent, current }, current, 0.75);
        Assert.Equal(1, asOfAssignment.OpenClaims);       // only the recent one

        var asOfNow = EmployeeHistory.AsOfNow(new[] { stale, recent }, 0.75, T0.AddDays(200));
        Assert.Equal(1, asOfNow.OpenClaims);
    }

    [Fact]
    public void AllocatedDays_IsNullWithoutDeadline_AndNeverNegative()
    {
        Assert.Null(EmployeeHistory.AllocatedDays(T0, null));
        Assert.Equal(0, EmployeeHistory.AllocatedDays(T0, T0.AddDays(-3)));
        Assert.Equal(7, EmployeeHistory.AllocatedDays(T0, T0.AddDays(7)));
    }

    [Fact]
    public void TeamPriorTimeline_OnlyUsesClaimsCompletedBeforeTheMoment()
    {
        var claims = new List<ClaimOutcome>();
        for (var i = 0; i < EmployeeHistory.TeamPriorTimeline.MinOutcomes; i++) claims.Add(Claim(i, i + 1, true));
        for (var i = 0; i < 100; i++) claims.Add(Claim(200 + i, 201 + i, false));   // all late, but only later
        var timeline = new EmployeeHistory.TeamPriorTimeline(claims);

        Assert.Equal(1.0, timeline.At(T0.AddDays(100)));                            // the late claims do not exist yet
        Assert.True(timeline.At(T0.AddDays(400)) < 0.3);                            // they do once completed
        Assert.Null(timeline.At(T0.AddDays(-1)));                                    // too little data: not used
    }
}
