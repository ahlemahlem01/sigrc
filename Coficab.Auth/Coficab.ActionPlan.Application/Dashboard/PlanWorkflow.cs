using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>
/// The six steps of the general workflow of an action plan (specification: Detection, Analysis, Planning, Execution, Verification, Closure).
/// The step is READ from what the plan already holds, never stored: nothing changes in the statuses, the 8D file or the validation circuit,
/// so the 8D workflow of the claims keeps working as it is and a later evolution can turn these steps into real statuses without a data migration.
/// </summary>
public static class PlanWorkflow
{
    public const int Detection = 1;
    public const int Analysis = 2;
    public const int Planning = 3;
    public const int Execution = 4;
    public const int Verification = 5;
    public const int Closure = 6;

    public static readonly string[] Codes = { "DETECTION", "ANALYSIS", "PLANNING", "EXECUTION", "VERIFICATION", "CLOSURE" };

    /// <summary>
    /// Closed or archived = Closure. Without detailed action: not yet assigned = Detection, assigned = Analysis (the owner looks for the causes).
    /// With actions: none started = Planning; some started = Execution; all finished (done, validated or cancelled) but the plan still open = Verification.
    /// The actions of the plan must be loaded.
    /// </summary>
    public static int Of(Core.Entities.ActionPlan plan)
    {
        if (plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived) return Closure;

        var actions = plan.PlanActions?.Where(a => !a.IsArchived).ToList() ?? new List<Core.Entities.PlanAction>();
        if (actions.Count == 0)
            return string.IsNullOrWhiteSpace(plan.AssignedToId) ? Detection : Analysis;
        if (actions.All(PlanDeadlines.IsFinished)) return Verification;
        return actions.Any(a => a.Progress != ActionProgress.NotStarted) ? Execution : Planning;
    }

    public static string Code(int stage) => Codes[Math.Clamp(stage, 1, Codes.Length) - 1];
}
