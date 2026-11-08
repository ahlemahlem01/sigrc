using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// The validation thread of a claim, shown to the administrator: first the root cause (5 Why), then the action plan (CAPA, D5).
/// The order is imposed elsewhere (the plan cannot be created before the root causes are validated); this only says where a claim stands.
/// </summary>
public static class ValidationThread
{
    public const string None = "none";             // no plan yet
    public const string InProgress = "inProgress"; // the plan exists, its actions are being done
    public const string ToValidate = "toValidate"; // every action is done: the administrator can decide
    public const string Validated = "validated";   // the administrator validated the plan
    public const string ToApprove = "toApprove";   // the plan was submitted: the administrator has to approve it before it is carried out
    public const string Returned = "returned";     // the administrator sent the plan back to its author

    /// <summary>The state of the second step from the plan of the claim (null when it has none).</summary>
    public static string PlanStep(ActionPlanStatus? status, int progress, PlanApprovalStatus approval = PlanApprovalStatus.Approved)
    {
        if (status is null) return None;
        if (status == ActionPlanStatus.Closed) return Validated;
        if (approval == PlanApprovalStatus.Pending) return ToApprove;
        if (approval == PlanApprovalStatus.Returned) return Returned;
        return progress >= 100 && status == ActionPlanStatus.Ongoing ? ToValidate : InProgress;
    }
}
