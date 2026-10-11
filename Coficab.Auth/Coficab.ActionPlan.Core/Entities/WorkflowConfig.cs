namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// A status of a configurable workflow (today: the claim workflow, key "claim").
/// Never deleted: an unused status is deactivated, so history keeps its meaning.
/// </summary>
public class WorkflowStatus
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string WorkflowKey { get; set; } = WorkflowKeys.Claim;
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsFinal { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}

/// <summary>An allowed move between two statuses and the roles that may make it. Deactivated, never deleted.</summary>
public class WorkflowTransition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string WorkflowKey { get; set; } = WorkflowKeys.Claim;
    public string FromCode { get; set; } = string.Empty;
    public string ToCode { get; set; } = string.Empty;

    /// <summary>Comma-separated roles: user, admin, superadmin.</summary>
    public string AllowedRoles { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}

public static class WorkflowKeys
{
    public const string Claim = "claim";
}

public static class WorkflowRoles
{
    public static readonly string[] All = { "user", "admin", "superadmin" };
}
