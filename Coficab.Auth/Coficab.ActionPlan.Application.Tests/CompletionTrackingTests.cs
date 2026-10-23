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

public class PlanProgressTests
{
    [Fact]
    public void Average_CapsValidatedAtHundred_AndIgnoresCancelled()
    {
        var actions = new[] { ActionProgress.Validated, ActionProgress.Fifty, ActionProgress.Cancelled };
        Assert.Equal(75, Coficab.ActionPlan.Application.Services.PlanProgress.FromActions(actions, 0));
    }

    [Fact]
    public void NoCountedAction_KeepsTheValueEnteredOnThePlan()
    {
        Assert.Equal(8, Coficab.ActionPlan.Application.Services.PlanProgress.FromActions(Array.Empty<ActionProgress>(), 8));
        Assert.Equal(8, Coficab.ActionPlan.Application.Services.PlanProgress.FromActions(new[] { ActionProgress.Cancelled }, 8));
        Assert.Equal(100, Coficab.ActionPlan.Application.Services.PlanProgress.FromActions(Array.Empty<ActionProgress>(), 250));
    }
}

public class BadgeDuplicatesTests
{
    private static Coficab.ActionPlan.Core.Entities.Badge Make(string user, string name, DateTime at, string? plan = null) =>
        new() { Id = Guid.NewGuid(), UserId = user, Name = name, Category = "speed", EarnedAt = at, PlanTitle = plan };

    [Fact]
    public void SameBadgeWrittenTwice_IsReadOnce_KeepingTheEarliest_AndOtherBadgesAreUntouched()
    {
        var first = new DateTime(2026, 10, 12, 17, 47, 6, DateTimeKind.Utc);
        var rows = new[]
        {
            Make("u1", "Rapidité Bronze", first.AddSeconds(4)),
            Make("u1", "Rapidité Bronze", first),
            Make("u1", "Rapidité Argent", first.AddSeconds(1)),
            Make("U1", "Rapidité Bronze", first.AddSeconds(9)),   // same person written in another case
            Make("u2", "Rapidité Bronze", first),                 // another person keeps theirs
            Make("u1", "CAPA dans les délais", first.AddSeconds(5), "Plan B"),
            Make("u1", "CAPA dans les délais", first, "Plan A"),  // the former per-plan awards are one badge: the earliest
        };
        var result = Coficab.ActionPlan.Application.Badges.BadgeDuplicates.Distinct(rows);
        Assert.Equal(4, result.Count);
        Assert.Equal(first, result.First(b => b.UserId == "u1" && b.Name == "Rapidité Bronze").EarnedAt);
        Assert.Equal("Plan A", result.Single(b => b.Name == "CAPA dans les délais").PlanTitle);
    }
}

public class BadgeGoalDuplicatesTests
{
    private static Coficab.ActionPlan.Core.Entities.Badge Make(string category, string name, int day, string user = "u1") =>
        new() { Id = Guid.NewGuid(), UserId = user, Name = name, Category = category, EarnedAt = new DateTime(2026, 7, day, 0, 0, 0, DateTimeKind.Utc) };

    [Fact]
    public void PerformanceSpelling_IsTheSameGoal_AndOnlyOneIsRead()
    {
        var rows = new[] { Make("performance-on-track", "Ponctuel", 12), Make("on-track", "Ponctuel", 20), Make("no-overdue", "Sans Retard", 5) };
        var result = Coficab.ActionPlan.Application.Badges.BadgeDuplicates.Distinct(rows);
        Assert.Equal(2, result.Count);
        Assert.Equal(12, result.Single(b => b.Name == "Ponctuel").EarnedAt.Day);
    }

    [Fact]
    public void GoalAlreadyGivenByTheEngine_IsNotShownTwice_ButOtherGoalsAreKept()
    {
        var rows = new[]
        {
            Make("first_plan", "Premier plan CAPA", 3),
            Make("performance-first-plan", "Premier Plan", 4),
            Make("speed", "CAPA dans les délais", 6),
            Make("fast-completer", "Rapide", 7),
            Make("perfectionist", "Perfectionniste", 8),
            Make("performance-first-plan", "Premier Plan", 4, user: "u2"),   // another person has no engine badge: keeps the goal
        };
        var result = Coficab.ActionPlan.Application.Badges.BadgeDuplicates.Distinct(rows);
        Assert.Equal(3, result.Count(b => b.UserId == "u1"));   // first_plan, speed and perfectionist
        Assert.DoesNotContain(result, b => b.UserId == "u1" && b.Category.Contains("first-plan"));
        Assert.DoesNotContain(result, b => b.UserId == "u1" && b.Category == "fast-completer");
        Assert.Contains(result, b => b.UserId == "u2");
    }
}
