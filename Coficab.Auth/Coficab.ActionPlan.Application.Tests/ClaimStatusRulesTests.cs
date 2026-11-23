using Coficab.ActionPlan.Application.Dashboard;
using Xunit;

namespace Coficab.ActionPlan.Application.Tests;

public class ClaimStatusRulesTests
{
    [Theory]
    [InlineData("OUVERTE", true)]
    [InlineData("ASSIGNED", true)]
    [InlineData("EN_ANALYSE", true)]
    [InlineData("PENDING_VALIDATION", true)]
    [InlineData("VALIDATED", false)]
    [InlineData("CLOTUREE", false)]
    [InlineData("archived", false)]
    [InlineData("DRAFT", false)]
    public void Open_means_neither_finished_nor_draft(string status, bool expected) =>
        Assert.Equal(expected, ClaimStatusRules.IsOpen(status));
}
