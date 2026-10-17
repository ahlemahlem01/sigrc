namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>
/// What "late" means for a claim, used by the dashboard and the assistant so the figures cannot diverge.
/// A claim is late only when it is still open, has a deadline and that deadline is before today.
/// A claim without a deadline is never late: it is reported on its own ("no deadline").
/// </summary>
public static class ClaimDeadlines
{
    public static bool HasNoDeadline(DateTime? deadline) => deadline is null;

    public static bool IsLate(DateTime? deadline, DateTime today) =>
        deadline is { } d && d.Date < today.Date;

    public static int OverdueDays(DateTime? deadline, DateTime today) =>
        deadline is { } d && d.Date < today.Date ? (today.Date - d.Date).Days : 0;
}
