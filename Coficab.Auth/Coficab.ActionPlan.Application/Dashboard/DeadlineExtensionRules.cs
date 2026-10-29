namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>Code is null on success, otherwise one of DeadlineExtensionRules codes, "notFound" or "notOpen".</summary>
public record DeadlineExtensionResult(string? Code, DateTime? OldDeadline = null, DateTime? NewDeadline = null, int ExtraDays = 0);

/// <summary>
/// When an administrator may give more time to a claim or a CAPA plan: only a late one, only forward, always with a reason.
/// Shared by claims and plans so the two cannot diverge. The previous date is never lost: the caller records old → new.
/// </summary>
public static class DeadlineExtensionRules
{
    public const int MinReasonLength = 10;
    public const int MaxReasonLength = 500;
    public const int MaxDaysAhead = 180;
    private const int MaxNotificationMessage = 500;

    /// <summary>Null when the extension is allowed, otherwise a stable code the API returns and the UI translates.</summary>
    public static string? Check(DateTime? currentDeadline, DateTime newDeadline, DateTime today, string? reason)
    {
        var trimmed = (reason ?? string.Empty).Trim();
        if (trimmed.Length < MinReasonLength) return "reasonRequired";
        if (trimmed.Length > MaxReasonLength) return "reasonTooLong";
        if (!ClaimDeadlines.IsLate(currentDeadline, today)) return "notLate";
        if (newDeadline.Date < today.Date) return "newDateInPast";
        if (newDeadline.Date <= currentDeadline!.Value.Date) return "notAfterCurrent";
        if (newDeadline.Date > today.Date.AddDays(MaxDaysAhead)) return "tooFar";
        return null;
    }

    /// <summary>What the person whose deadline moved reads in their notification: new date, old date, extra days and the reason.</summary>
    public static string NotificationMessage(string title, DateTime oldDeadline, DateTime newDeadline, string reason)
    {
        var text = $"L'échéance de « {title} » est prolongée au {newDeadline:dd/MM/yyyy} (+{ExtraDays(oldDeadline, newDeadline)} j, ancienne échéance : {oldDeadline:dd/MM/yyyy}). Motif : {reason.Trim()}";
        return text.Length > MaxNotificationMessage ? text[..(MaxNotificationMessage - 1)] + "…" : text;   // the column holds 500 characters
    }

    /// <summary>The same facts as data (ISO dates), so the screen of each reader writes the sentence in their language.</summary>
    public static string NotificationData(string title, DateTime oldDeadline, DateTime newDeadline, string reason) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            title,
            oldDeadline = oldDeadline.ToString("yyyy-MM-dd"),
            newDeadline = newDeadline.ToString("yyyy-MM-dd"),
            days = ExtraDays(oldDeadline, newDeadline),
            reason = reason.Trim(),
        });

    public static int ExtraDays(DateTime currentDeadline, DateTime newDeadline) => (newDeadline.Date - currentDeadline.Date).Days;

    /// <summary>One line for the audit trail: nothing is overwritten without its old value and its reason.</summary>
    public static string Describe(DateTime oldDeadline, DateTime newDeadline, string reason) =>
        $"{oldDeadline:yyyy-MM-dd} → {newDeadline:yyyy-MM-dd} (+{ExtraDays(oldDeadline, newDeadline)} d) · {reason.Trim()}";
}
