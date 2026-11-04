using Coficab.ActionPlan.Application.Notifications;

namespace Coficab.ActionPlan.Application.Tests;

public class DigestScheduleTests
{
    // 2026-11-04 is a Wednesday
    private static readonly DateTime Wed10h = new(2026, 11, 4, 10, 0, 0);

    [Fact]
    public void ItNeverRunsWhenOff()
    {
        var off = new DigestSchedule(DigestMode.Off, 8, 1, 0);
        Assert.Null(off.LastSlot(Wed10h));
        Assert.False(off.IsDue(Wed10h, null));
    }

    [Fact]
    public void Daily_IsDueOnceAfterTheHour()
    {
        var daily = new DigestSchedule(DigestMode.Daily, 8, 1, 0);
        Assert.False(daily.IsDue(new DateTime(2026, 11, 4, 7, 59, 0), new DateTime(2026, 11, 3, 8, 0, 0)));   // before today's slot
        Assert.True(daily.IsDue(Wed10h, new DateTime(2026, 11, 3, 8, 1, 0)));                                  // slot of 8:00 passed, not run yet
        Assert.False(daily.IsDue(Wed10h, new DateTime(2026, 11, 4, 8, 1, 0)));                                 // already run today
    }

    [Fact]
    public void Weekly_WaitsForItsDayOfTheWeek()
    {
        var mondays = new DigestSchedule(DigestMode.Weekly, 9, (int)DayOfWeek.Monday, 0);
        var slot = mondays.LastSlot(Wed10h);
        Assert.Equal(new DateTime(2026, 11, 2, 9, 0, 0), slot);                                                // the Monday before
        Assert.False(mondays.IsDue(Wed10h, new DateTime(2026, 11, 2, 9, 5, 0)));
        Assert.True(mondays.IsDue(Wed10h, new DateTime(2026, 10, 26, 9, 5, 0)));
    }

    [Fact]
    public void Custom_UsesTheChosenDaysAndHour()
    {
        var mask = (1 << (int)DayOfWeek.Tuesday) | (1 << (int)DayOfWeek.Friday);
        var custom = new DigestSchedule(DigestMode.Custom, 14, 0, mask);
        Assert.Equal(new DateTime(2026, 11, 3, 14, 0, 0), custom.LastSlot(Wed10h));                            // Tuesday 14:00
        Assert.True(custom.RunsOn(DayOfWeek.Friday));
        Assert.False(custom.RunsOn(DayOfWeek.Thursday));
    }

    [Theory]
    [InlineData(DigestMode.Daily, 24, 1, 0, false)]
    [InlineData(DigestMode.Daily, -1, 1, 0, false)]
    [InlineData(DigestMode.Weekly, 8, 7, 0, false)]
    [InlineData(DigestMode.Custom, 8, 1, 0, false)]
    [InlineData(DigestMode.Custom, 8, 1, 4, true)]
    [InlineData(DigestMode.Off, 8, 1, 0, true)]
    public void ItRefusesWhatCannotBeScheduled(DigestMode mode, int hour, int day, int mask, bool valid) =>
        Assert.Equal(valid, new DigestSchedule(mode, hour, day, mask).IsValid(out _));
}
