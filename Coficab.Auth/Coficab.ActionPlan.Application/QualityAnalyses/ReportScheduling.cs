using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.QualityAnalyses;

/// <summary>When a scheduled report runs next. The hour is Tunisia time (UTC+1, no daylight saving).</summary>
public static class ReportScheduling
{
    private static readonly TimeSpan Offset = TimeSpan.FromHours(1);

    public static DateTime NextRun(ReportSchedule schedule, DateTime nowUtc)
    {
        var local = nowUtc + Offset;
        var hour = Math.Clamp(schedule.Hour, 0, 23);
        DateTime candidate;
        if (string.Equals(schedule.Frequency, "monthly", StringComparison.OrdinalIgnoreCase))
        {
            var day = Math.Clamp(schedule.DayOfMonth, 1, 28);
            candidate = new DateTime(local.Year, local.Month, day, hour, 0, 0);
            if (candidate <= local) candidate = candidate.AddMonths(1);
        }
        else
        {
            candidate = local.Date.AddHours(hour);
            var delta = ((Math.Clamp(schedule.DayOfWeek, 0, 6) - (int)candidate.DayOfWeek) + 7) % 7;
            candidate = candidate.AddDays(delta);
            if (candidate <= local) candidate = candidate.AddDays(7);
        }
        return DateTime.SpecifyKind(candidate - Offset, DateTimeKind.Utc);
    }
}
