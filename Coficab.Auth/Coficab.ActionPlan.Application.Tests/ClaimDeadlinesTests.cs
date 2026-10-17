using Coficab.ActionPlan.Application.Dashboard;

namespace Coficab.ActionPlan.Application.Tests;

public class ClaimDeadlinesTests
{
    private static readonly DateTime Today = new(2026, 10, 17, 14, 30, 0, DateTimeKind.Utc);

    [Fact]
    public void ClaimWithoutDeadline_IsNeverLate_AndIsReportedAsNoDeadline()
    {
        Assert.False(ClaimDeadlines.IsLate(null, Today));
        Assert.Equal(0, ClaimDeadlines.OverdueDays(null, Today));
        Assert.True(ClaimDeadlines.HasNoDeadline(null));
    }

    [Fact]
    public void ClaimIsLateOnlyOnceTheDeadlineDayHasPassed()
    {
        Assert.False(ClaimDeadlines.IsLate(Today, Today));                       // due today: not late yet
        Assert.False(ClaimDeadlines.IsLate(Today.AddDays(3), Today));
        Assert.True(ClaimDeadlines.IsLate(Today.AddDays(-1), Today));
        Assert.Equal(5, ClaimDeadlines.OverdueDays(Today.AddDays(-5).AddHours(7), Today));  // the time of day does not matter
        Assert.False(ClaimDeadlines.HasNoDeadline(Today));
    }
}
