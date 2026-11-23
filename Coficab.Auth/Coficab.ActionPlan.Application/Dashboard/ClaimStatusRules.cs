namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>
/// What "open" means for a claim, shared by the assistant so its figures match the dashboard.
/// A claim is finished once closed, validated or archived; a draft is not yet a claim in progress.
/// </summary>
public static class ClaimStatusRules
{
    public static bool IsClosed(string? status) =>
        Is(status, "CLOTUREE") || Is(status, "CLOSED") || Is(status, "CLOTURE")
        || Is(status, "VALIDATED") || Is(status, "ARCHIVED");

    public static bool IsDraft(string? status) => Is(status, "DRAFT") || Is(status, "BROUILLON");

    public static bool IsOpen(string? status) => !IsClosed(status) && !IsDraft(status);

    private static bool Is(string? status, string code) =>
        string.Equals(status, code, StringComparison.OrdinalIgnoreCase);
}
