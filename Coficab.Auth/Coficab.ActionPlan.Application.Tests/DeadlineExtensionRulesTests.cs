using Coficab.ActionPlan.Application.Dashboard;

namespace Coficab.ActionPlan.Application.Tests;

public class DeadlineExtensionRulesTests
{
    private static readonly DateTime Today = new(2026, 10, 29, 0, 0, 0, DateTimeKind.Utc);
    private const string Reason = "Fournisseur en retard sur le lot.";

    [Fact]
    public void ALateItem_CanBeExtendedForward_WithAReason()
    {
        Assert.Null(DeadlineExtensionRules.Check(Today.AddDays(-5), Today.AddDays(7), Today, Reason));
        Assert.Null(DeadlineExtensionRules.Check(Today.AddDays(-5), Today, Today, Reason));   // new date today is allowed
    }

    [Theory]
    [InlineData(null, "reasonRequired")]
    [InlineData("", "reasonRequired")]
    [InlineData("trop bref", "reasonRequired")]
    public void TheReasonIsRequired(string? reason, string expected) =>
        Assert.Equal(expected, DeadlineExtensionRules.Check(Today.AddDays(-5), Today.AddDays(7), Today, reason));

    [Fact]
    public void ReasonTooLong_IsRefused() =>
        Assert.Equal("reasonTooLong", DeadlineExtensionRules.Check(Today.AddDays(-5), Today.AddDays(7), Today, new string('x', 501)));

    [Fact]
    public void OnlyALateItem_IsExtended()
    {
        Assert.Equal("notLate", DeadlineExtensionRules.Check(Today, Today.AddDays(5), Today, Reason));              // due today is not late
        Assert.Equal("notLate", DeadlineExtensionRules.Check(Today.AddDays(2), Today.AddDays(9), Today, Reason));
        Assert.Equal("notLate", DeadlineExtensionRules.Check(null, Today.AddDays(9), Today, Reason));               // no deadline: nothing to extend
    }

    [Fact]
    public void TheNewDate_IsNeverInThePast_NeverBeforeTheCurrentOne_AndNeverTooFar()
    {
        Assert.Equal("newDateInPast", DeadlineExtensionRules.Check(Today.AddDays(-5), Today.AddDays(-1), Today, Reason));
        Assert.Equal("tooFar", DeadlineExtensionRules.Check(Today.AddDays(-5), Today.AddDays(181), Today, Reason));
        Assert.Null(DeadlineExtensionRules.Check(Today.AddDays(-5), Today.AddDays(180), Today, Reason));
    }

    [Fact]
    public void TheTraceKeepsOldDate_NewDate_ExtraDays_AndReason()
    {
        var line = DeadlineExtensionRules.Describe(new DateTime(2026, 10, 10), new DateTime(2026, 11, 5), " " + Reason + " ");
        Assert.Equal("2026-10-10 → 2026-11-05 (+26 d) · Fournisseur en retard sur le lot.", line);
    }

    [Fact]
    public void TheFallbackMessage_FitsTheColumn_AndTheDataKeepsTheFullReason()
    {
        var reason = new string('x', 500);
        var message = DeadlineExtensionRules.NotificationMessage("Plan", new DateTime(2026, 10, 10), new DateTime(2026, 11, 5), reason);
        Assert.True(message.Length <= 500);

        var data = System.Text.Json.JsonDocument.Parse(DeadlineExtensionRules.NotificationData("Plan", new DateTime(2026, 10, 10), new DateTime(2026, 11, 5), reason)).RootElement;
        Assert.Equal("2026-10-10", data.GetProperty("oldDeadline").GetString());
        Assert.Equal("2026-11-05", data.GetProperty("newDeadline").GetString());
        Assert.Equal(26, data.GetProperty("days").GetInt32());
        Assert.Equal(reason, data.GetProperty("reason").GetString());
    }
}
