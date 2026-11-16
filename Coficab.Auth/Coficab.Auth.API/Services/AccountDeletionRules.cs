using Coficab.Auth.API.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.Auth.API.Services;

/// <summary>
/// When an account may be deleted for good. A person is referenced by identifier in claims, plans, actions and the audit trail of the other API:
/// no database constraint protects those references, so an account that appears in them is never deleted, it is locked instead.
/// </summary>
public static class AccountDeletionRules
{
    public const string OwnAccount = "own_account";
    public const string SuperadminNeedsSuperadmin = "superadmin_needs_superadmin";
    public const string LastSuperadmin = "last_superadmin";
    public const string HasHistory = "account_has_history";

    /// <summary>The reason why the account must not be deleted, or null when it may be.</summary>
    public static string? Check(string targetId, string currentUserId, IReadOnlyCollection<string> targetRoles,
        int superadminCount, bool callerIsSuperadmin, int historyCount)
    {
        if (string.Equals(targetId, currentUserId, StringComparison.OrdinalIgnoreCase)) return OwnAccount;
        var isSuperadmin = targetRoles.Contains("superadmin", StringComparer.OrdinalIgnoreCase);
        if (isSuperadmin && !callerIsSuperadmin) return SuperadminNeedsSuperadmin;
        if (isSuperadmin && superadminCount <= 1) return LastSuperadmin;
        if (historyCount > 0) return HasHistory;
        return null;
    }

    public static string Message(string reason, int historyCount) => reason switch
    {
        OwnAccount => "You cannot delete your own account.",
        SuperadminNeedsSuperadmin => "Only a super administrator can delete a super administrator account.",
        LastSuperadmin => "Cannot delete the last superadmin account.",
        HasHistory => $"This account appears in {historyCount} claim(s), plan(s), action(s) or event(s). Lock it instead of deleting it, so that the history stays valid.",
        _ => "This account cannot be deleted.",
    };

    /// <summary>How many claims, plans, actions and events of the other API point at this person (0 when the schema is not there, as in the tests).</summary>
    public static async Task<int> HistoryCountAsync(AppDbContext db, string userId, CancellationToken ct = default)
    {
        if (!db.Database.IsRelational()) return 0;
        return await db.Database.SqlQuery<int>($@"
            SELECT (SELECT COUNT(*) FROM actionplan.Claims WHERE AssignedToId = {userId} OR CreatedById = {userId})
                 + (SELECT COUNT(*) FROM actionplan.ActionPlans WHERE OwnerId = {userId} OR AssignedToId = {userId})
                 + (SELECT COUNT(*) FROM actionplan.PlanActions WHERE AssignedToId = {userId})
                 + (SELECT COUNT(*) FROM actionplan.ClaimEvents WHERE ActorId = {userId}) AS Value").SingleAsync(ct);
    }
}
