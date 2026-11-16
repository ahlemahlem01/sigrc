using Coficab.Auth.API.Services;

namespace Coficab.Auth.API.Tests;

/// <summary>An account is deleted for good only when nothing points at it: otherwise it is locked, and the history stays valid.</summary>
public class AccountDeletionRulesTests
{
    private static readonly string[] User = { "user" };
    private static readonly string[] Super = { "superadmin" };

    [Fact]
    public void AnAccountWithoutHistory_MayBeDeleted() =>
        Assert.Null(AccountDeletionRules.Check("a", "me", User, superadminCount: 0, callerIsSuperadmin: true, historyCount: 0));

    [Fact]
    public void AnAccountThatAppearsInTheHistory_IsNeverDeleted() =>
        Assert.Equal(AccountDeletionRules.HasHistory,
            AccountDeletionRules.Check("a", "me", User, 0, callerIsSuperadmin: true, historyCount: 3));

    [Fact]
    public void NobodyDeletesTheirOwnAccount() =>
        Assert.Equal(AccountDeletionRules.OwnAccount,
            AccountDeletionRules.Check("me", "ME", User, 0, callerIsSuperadmin: true, historyCount: 0));

    [Fact]
    public void AnAdministrator_CannotDeleteASuperadmin() =>
        Assert.Equal(AccountDeletionRules.SuperadminNeedsSuperadmin,
            AccountDeletionRules.Check("s", "admin", Super, superadminCount: 2, callerIsSuperadmin: false, historyCount: 0));

    [Fact]
    public void TheLastSuperadmin_IsKept() =>
        Assert.Equal(AccountDeletionRules.LastSuperadmin,
            AccountDeletionRules.Check("s", "other", Super, superadminCount: 1, callerIsSuperadmin: true, historyCount: 0));

    [Fact]
    public void AnotherSuperadmin_MayBeDeleted_WhenNotTheLastOne() =>
        Assert.Null(AccountDeletionRules.Check("s", "other", Super, superadminCount: 2, callerIsSuperadmin: true, historyCount: 0));

    [Fact]
    public void TheMessage_SaysHowManyReferencesThereAre()
    {
        var text = AccountDeletionRules.Message(AccountDeletionRules.HasHistory, 7);
        Assert.Contains("7", text);
        Assert.Contains("Lock it", text);
    }
}
