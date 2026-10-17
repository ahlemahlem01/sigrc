using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>What "late" means for a CAPA plan, shared by the dashboard summary and the overview.</summary>
public static class PlanDeadlines
{
    /// <summary>
    /// Days of delay of an open plan: the sum, over its actions that are not finished and have a deadline, of the days past
    /// that deadline; a plan without actions uses its own deadline. Zero when the plan is closed or on time.
    /// </summary>
    public static int OverdueDays(Core.Entities.ActionPlan plan, DateTime today)
    {
        if (plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived)
            return 0;

        var actions = plan.PlanActions?.Where(a => !a.IsArchived).ToList();
        if (actions is { Count: > 0 })
        {
            var sum = 0;
            foreach (var a in actions)
            {
                if (a.Progress is ActionProgress.Hundred or ActionProgress.Validated or ActionProgress.Cancelled)
                    continue;
                if (!a.Deadline.HasValue) continue;
                var lag = (today.Date - a.Deadline.Value.Date).Days;
                if (lag > 0) sum += lag;
            }
            return sum;
        }

        if (!plan.Deadline.HasValue) return 0;
        var planLag = (today.Date - plan.Deadline.Value.Date).Days;
        return planLag > 0 ? planLag : 0;
    }

    /// <summary>The worst delay of an open plan: its most overdue unfinished action (or its own deadline without actions). Used for aging.</summary>
    public static int MaxLagDays(Core.Entities.ActionPlan plan, DateTime today)
    {
        if (plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived)
            return 0;
        var actions = plan.PlanActions?.Where(a => !a.IsArchived).ToList();
        if (actions is { Count: > 0 })
        {
            var worst = actions.Where(a => !IsFinished(a) && a.Deadline.HasValue)
                .Select(a => (today.Date - a.Deadline!.Value.Date).Days).DefaultIfEmpty(0).Max();
            return worst > 0 ? worst : 0;
        }
        if (!plan.Deadline.HasValue) return 0;
        var lag = (today.Date - plan.Deadline.Value.Date).Days;
        return lag > 0 ? lag : 0;
    }

    /// <summary>An action that no longer needs work: done at 100 %, validated or cancelled.</summary>
    public static bool IsFinished(Core.Entities.PlanAction a) =>
        a.Progress is ActionProgress.Hundred or ActionProgress.Validated or ActionProgress.Cancelled;

    public static bool IsOpen(Core.Entities.ActionPlan plan) =>
        plan.Status is ActionPlanStatus.Created or ActionPlanStatus.Ongoing;
}
