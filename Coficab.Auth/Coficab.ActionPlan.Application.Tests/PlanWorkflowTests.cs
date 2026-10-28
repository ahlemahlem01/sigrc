using Coficab.ActionPlan.Application.Dashboard;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.Tests;

/// <summary>The six steps of the general workflow are read from the plan: no status is added, the 8D workflow is untouched.</summary>
public class PlanWorkflowTests
{
    private static PlanAction Action(ActionProgress progress, bool archived = false) => new() { Title = "a", Progress = progress, IsArchived = archived };

    private static Core.Entities.ActionPlan Plan(ActionPlanStatus status, string? assignee, params PlanAction[] actions)
    {
        var plan = new Core.Entities.ActionPlan { Title = "p", Status = status, AssignedToId = assignee };
        foreach (var a in actions) plan.PlanActions.Add(a);
        return plan;
    }

    [Fact]
    public void ANewPlanWithoutOwnerIsDetection_AndOnceAssignedItIsAnalysis()
    {
        Assert.Equal(PlanWorkflow.Detection, PlanWorkflow.Of(Plan(ActionPlanStatus.Created, null)));
        Assert.Equal(PlanWorkflow.Detection, PlanWorkflow.Of(Plan(ActionPlanStatus.Created, "  ")));
        Assert.Equal(PlanWorkflow.Analysis, PlanWorkflow.Of(Plan(ActionPlanStatus.Ongoing, "user-1")));
    }

    [Fact]
    public void WithActions_ItIsPlanningThenExecutionThenVerification()
    {
        Assert.Equal(PlanWorkflow.Planning, PlanWorkflow.Of(Plan(ActionPlanStatus.Ongoing, "u", Action(ActionProgress.NotStarted), Action(ActionProgress.NotStarted))));
        Assert.Equal(PlanWorkflow.Execution, PlanWorkflow.Of(Plan(ActionPlanStatus.Ongoing, "u", Action(ActionProgress.Fifty), Action(ActionProgress.NotStarted))));
        Assert.Equal(PlanWorkflow.Verification, PlanWorkflow.Of(Plan(ActionPlanStatus.Ongoing, "u", Action(ActionProgress.Hundred), Action(ActionProgress.Validated), Action(ActionProgress.Cancelled))));
    }

    [Fact]
    public void ArchivedActionsAreIgnored_AndAClosedPlanIsAlwaysClosure()
    {
        Assert.Equal(PlanWorkflow.Planning, PlanWorkflow.Of(Plan(ActionPlanStatus.Ongoing, "u", Action(ActionProgress.NotStarted), Action(ActionProgress.Hundred, archived: true))));
        Assert.Equal(PlanWorkflow.Closure, PlanWorkflow.Of(Plan(ActionPlanStatus.Closed, null)));
        Assert.Equal(PlanWorkflow.Closure, PlanWorkflow.Of(Plan(ActionPlanStatus.Archived, "u", Action(ActionProgress.NotStarted))));
    }

    [Fact]
    public void TheCodesFollowTheSixSteps()
    {
        Assert.Equal(new[] { "DETECTION", "ANALYSIS", "PLANNING", "EXECUTION", "VERIFICATION", "CLOSURE" }, Enumerable.Range(1, 6).Select(PlanWorkflow.Code));
    }
}
