using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Licences;

/// <summary>
/// The state of the licence of the platform, for the message shown at the top of the pages and on the login page:
/// none (no licence recorded: nothing to say), ok, expiring (an alert before the expiry) or expired.
/// When several licences exist (one per site, or a global one), the most urgent one decides.
/// </summary>
public static class LicenceStatus
{
    public const int WarnDays = 30;

    public sealed record Result(string State, int? DaysLeft, DateTime? ExpiresAt);

    public static Result Compute(IEnumerable<Licence> licences, DateTime now, int warnDays = WarnDays)
    {
        var active = licences.Where(l => !l.IsArchived).OrderBy(l => l.ExpiresAt).FirstOrDefault();
        if (active == null) return new Result("none", null, null);

        var days = (int)Math.Floor((active.ExpiresAt - now).TotalDays);
        if (active.ExpiresAt <= now) return new Result("expired", days, active.ExpiresAt);
        return new Result(days <= warnDays ? "expiring" : "ok", days, active.ExpiresAt);
    }

    /// <summary>Users the licence allows: the global licence when there is one, else the sum of the sites' licences. Null: no limit recorded.</summary>
    public static int? MaxUsers(IEnumerable<Licence> licences)
    {
        var list = licences.Where(l => !l.IsArchived).ToList();
        if (list.Count == 0) return null;
        var global = list.Where(l => l.IsGlobal).OrderByDescending(l => l.ExpiresAt).FirstOrDefault();
        return global != null ? global.MaxUsers : list.Sum(l => l.MaxUsers);
    }
}
