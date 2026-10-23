using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.Services;

/// <summary>
/// The one rule for the progress of a CAPA plan: the average of its sub-actions, where a validated sub-action counts as 100 %
/// and a cancelled one does not count at all. A plan without any sub-action keeps the value entered on the plan itself.
/// </summary>
public static class PlanProgress
{
    public static int FromActions(IEnumerable<ActionProgress> actions, int stored)
    {
        var counted = actions.Where(a => a != ActionProgress.Cancelled).Select(a => Math.Min(100, (int)a)).ToList();
        if (counted.Count == 0) return Math.Clamp(stored, 0, 100);
        return (int)Math.Round(counted.Average(), MidpointRounding.AwayFromZero);
    }
}
