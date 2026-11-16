namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// One reminder sent by an employee to the validators about something that waits for their decision (a 5 Why, a CAPA plan, an 8D dossier).
/// Append-only: it lets the application limit the reminders (one a day per item and per person) and show when the last one was sent.
/// </summary>
public class ValidationReminder
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>fiveWhy | capa | eightD</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>The analysis, the plan or the dossier the reminder is about.</summary>
    public Guid TargetId { get; set; }
    public Guid? ClaimId { get; set; }
    public string RequestedById { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
