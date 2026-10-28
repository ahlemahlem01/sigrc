using Coficab.ActionPlan.Core.Common;

namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// A comment on an action plan, written by an administrator or by someone who works on the plan.
/// Never deleted: removing a comment archives it (kept in the database, hidden from the page).
/// </summary>
public class ActionPlanComment : BaseEntity
{
    public Guid ActionPlanId { get; set; }
    public ActionPlan ActionPlan { get; set; } = null!;

    /// <summary>Identity user id of the author.</summary>
    public string AuthorId { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;

    /// <summary>Set when the author changed the text after posting it.</summary>
    public DateTime? EditedAt { get; set; }
}
