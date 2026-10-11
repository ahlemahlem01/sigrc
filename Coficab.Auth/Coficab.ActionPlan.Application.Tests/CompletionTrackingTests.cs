using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Enums;
using ActionPlanEntity = Coficab.ActionPlan.Core.Entities.ActionPlan;
using ClaimEntity = Coficab.ActionPlan.Core.Entities.Claim;

namespace Coficab.ActionPlan.Application.Tests;

public class CompletionTrackingTests
{
    [Theory]
    [InlineData("CLOTUREE", true)]
    [InlineData("CLOSED", true)]
    [InlineData("OUVERTE", false)]
    [InlineData("ASSIGNED", false)]
    [InlineData(null, false)]
    public void IsClosedClaimStatus_RecognizesClosedCodes(string? code, bool expected)
    {
        Assert.Equal(expected, CompletionTracking.IsClosedClaimStatus(code));
    }

    [Fact]
    public void ApplyClaimCompletion_SetsCompletedAtAndIsOnTime()
    {
        var claim = new ClaimEntity
        {
            StatusCode = "CLOTUREE",
            Deadline = DateTime.UtcNow.Date.AddDays(2),
            CreatedAt = DateTime.UtcNow.AddDays(-5)
        };

        CompletionTracking.ApplyClaimCompletion(claim, "ASSIGNED");

        Assert.NotNull(claim.CompletedAt);
        Assert.True(claim.IsOnTime);
    }

    [Fact]
    public void ApplyActionPlanCompletion_ForcesProgress100()
    {
        var plan = new ActionPlanEntity
        {
            Title = "CAPA test",
            Status = ActionPlanStatus.Closed,
            Progress = 40,
            Deadline = DateTime.UtcNow.Date.AddDays(-1)
        };

        CompletionTracking.ApplyActionPlanCompletion(plan, ActionPlanStatus.Ongoing);

        Assert.Equal(100, plan.Progress);
        Assert.NotNull(plan.CompletedAt);
        Assert.False(plan.IsOnTime);
    }
}
