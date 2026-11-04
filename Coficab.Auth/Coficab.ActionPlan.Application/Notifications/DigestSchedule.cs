namespace Coficab.ActionPlan.Application.Notifications;

public enum DigestMode { Off = 0, Daily = 1, Weekly = 2, Custom = 3 }

/// <summary>
/// When the notification digest is sent, as the local administrator sets it (specification: daily, weekly or a personalized
/// day and hour of the week). <c>Day</c> is the day of the week of the weekly digest (0 Sunday … 6 Saturday); <c>DaysMask</c> has
/// bit n set when the custom digest is sent on the day n.
/// </summary>
public sealed record DigestSchedule(DigestMode Mode, int Hour, int Day, int DaysMask)
{
    public static readonly DigestSchedule Default = new(DigestMode.Off, 8, 1, 0b0111110);

    public bool RunsOn(DayOfWeek day) => Mode switch
    {
        DigestMode.Daily => true,
        DigestMode.Weekly => (int)day == Day,
        DigestMode.Custom => (DaysMask & (1 << (int)day)) != 0,
        _ => false,
    };

    /// <summary>The latest moment (local time) at or before <paramref name="nowLocal"/> when the digest had to go out; null when there is none.</summary>
    public DateTime? LastSlot(DateTime nowLocal)
    {
        if (Mode == DigestMode.Off) return null;
        for (var back = 0; back <= 7; back++)
        {
            var day = nowLocal.Date.AddDays(-back);
            if (!RunsOn(day.DayOfWeek)) continue;
            var slot = day.AddHours(Hour);
            if (slot <= nowLocal) return slot;
        }
        return null;
    }

    /// <summary>True when a slot has passed since the last run.</summary>
    public bool IsDue(DateTime nowLocal, DateTime? lastRunLocal)
    {
        var slot = LastSlot(nowLocal);
        return slot != null && (lastRunLocal == null || lastRunLocal < slot);
    }

    public bool IsValid(out string? error)
    {
        error = null;
        if (!Enum.IsDefined(Mode)) error = "Mode inconnu.";
        else if (Hour is < 0 or > 23) error = "L'heure doit être comprise entre 0 et 23.";
        else if (Mode == DigestMode.Weekly && Day is < 0 or > 6) error = "Le jour doit être compris entre 0 (dimanche) et 6 (samedi).";
        else if (Mode == DigestMode.Custom && (DaysMask & 0b1111111) == 0) error = "Choisissez au moins un jour.";
        return error == null;
    }
}
