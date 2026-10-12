using Coficab.ActionPlan.Application.Badges;

namespace Coficab.ActionPlan.Application.Tests;

public class BadgeRulesTests
{
    private static readonly DateTime Now = new(2026, 10, 12, 0, 0, 0, DateTimeKind.Utc);

    private static ClosedClaim C(int daysAgo, bool onTime) => new(Now.AddDays(-daysAgo), onTime);

    private static List<ClosedClaim> Run(int count, bool onTime, int startDaysAgo)
        => Enumerable.Range(0, count).Select(i => C(startDaysAgo - i, onTime)).ToList();

    private static string[] Names(IEnumerable<Core.DTOs.Employee.AwardBadgeDto> badges) => badges.Select(b => b.Name).ToArray();

    [Fact]
    public void FirstOnTimeClosure_EarnsBronze_OnlyThat()
    {
        var names = Names(BadgeRules.Earned(new[] { C(2, true) }, reliable: false, Now));
        Assert.Equal(new[] { "Rapidité Bronze" }, names);
    }

    [Fact]
    public void LateClosures_EarnNothing()
    {
        Assert.Empty(BadgeRules.Earned(Run(8, false, 40), reliable: false, Now));
    }

    [Fact]
    public void SpeedTiers_FollowTheCountOfOnTimeClosures_NotTheLateOnes()
    {
        var claims = Run(10, true, 100).Concat(Run(30, false, 80)).ToList();
        var names = Names(BadgeRules.Earned(claims, false, Now));
        Assert.Contains("Rapidité Bronze", names);
        Assert.Contains("Rapidité Argent", names);
        Assert.DoesNotContain("Rapidité Or", names);
    }

    [Fact]
    public void Streak_NeedsConsecutiveOnTimeClosures_AndIsBrokenByALateOne()
    {
        // 4 on time, 1 late, 4 on time: the longest run is 4, so no streak badge
        var broken = Run(4, true, 60).Concat(new[] { C(50, false) }).Concat(Run(4, true, 40)).ToList();
        Assert.DoesNotContain("Série de 5", Names(BadgeRules.Earned(broken, false, Now)));

        var names = Names(BadgeRules.Earned(Run(5, true, 40), false, Now));
        Assert.Contains("Série de 5", names);
        Assert.DoesNotContain("Série de 10", names);
    }

    [Fact]
    public void Streak_ThatWasReachedEarlier_StillCountsAfterALaterDelay()
    {
        var claims = Run(5, true, 90).Concat(new[] { C(10, false) }).ToList();
        Assert.Contains("Série de 5", Names(BadgeRules.Earned(claims, false, Now)));
    }

    [Fact]
    public void PerfectQuarter_NeedsAFinishedQuarter_EnoughClaims_AndNoDelay()
    {
        var q2 = new[] { new ClosedClaim(new DateTime(2026, 4, 3, 0, 0, 0, DateTimeKind.Utc), true),
                         new ClosedClaim(new DateTime(2026, 5, 3, 0, 0, 0, DateTimeKind.Utc), true),
                         new ClosedClaim(new DateTime(2026, 6, 3, 0, 0, 0, DateTimeKind.Utc), true) };
        Assert.Contains("Trimestre parfait T2 2026", Names(BadgeRules.Earned(q2, false, Now)));

        // too few claims
        Assert.DoesNotContain("Trimestre parfait T2 2026", Names(BadgeRules.Earned(q2.Take(2).ToList(), false, Now)));

        // one delay spoils it
        var spoiled = q2.Take(2).Append(new ClosedClaim(new DateTime(2026, 6, 3, 0, 0, 0, DateTimeKind.Utc), false)).ToList();
        Assert.DoesNotContain("Trimestre parfait T2 2026", Names(BadgeRules.Earned(spoiled, false, Now)));

        // the current quarter (Q4 2026) is not over yet
        var q4 = Enumerable.Range(0, 4).Select(i => new ClosedClaim(new DateTime(2026, 10, 1 + i, 0, 0, 0, DateTimeKind.Utc), true)).ToList();
        Assert.DoesNotContain(Names(BadgeRules.Earned(q4, false, Now)), n => n.StartsWith("Trimestre parfait"));
    }

    [Fact]
    public void ReliabilityCutoff_NeedsEnoughComparableColleagues()
    {
        var few = new[] { (OnTime: 20, Closed: 25), (OnTime: 18, Closed: 25), (OnTime: 10, Closed: 25) };
        Assert.Null(BadgeRules.ReliabilityCutoff(few, 0.7));
    }

    [Fact]
    public void Reliable_IsTheTopQuartileOfTheTeam_AndAboveTheTeamAverage()
    {
        var team = new[]
        {
            (OnTime: 24, Closed: 25), (OnTime: 20, Closed: 25), (OnTime: 18, Closed: 25), (OnTime: 15, Closed: 25),
            (OnTime: 14, Closed: 25), (OnTime: 12, Closed: 25), (OnTime: 10, Closed: 25), (OnTime: 9, Closed: 25),
        };
        const double teamRate = 0.62;
        var cutoff = BadgeRules.ReliabilityCutoff(team, teamRate);

        Assert.NotNull(cutoff);
        Assert.True(BadgeRules.IsReliable(24, 25, teamRate, cutoff));
        Assert.True(BadgeRules.IsReliable(20, 25, teamRate, cutoff));
        Assert.False(BadgeRules.IsReliable(15, 25, teamRate, cutoff));
        Assert.False(BadgeRules.IsReliable(10, 25, teamRate, cutoff));
        // a colleague with a perfect but short record does not qualify
        Assert.False(BadgeRules.IsReliable(5, 5, teamRate, cutoff));
    }

    [Fact]
    public void Reliable_Badge_IsOnlyReturnedWhenFlagged()
    {
        var claims = Run(3, true, 20);
        Assert.DoesNotContain("Fiabilité · meilleurs 25 %", Names(BadgeRules.Earned(claims, false, Now)));
        Assert.Contains("Fiabilité · meilleurs 25 %", Names(BadgeRules.Earned(claims, true, Now)));
    }
}
