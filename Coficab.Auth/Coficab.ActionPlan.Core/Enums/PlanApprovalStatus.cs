namespace Coficab.ActionPlan.Core.Enums;

/// <summary>
/// The administrator approves a plan built from a 5 Why before its actions are carried out. Plans that existed before this step,
/// and plans created by other means, are Approved (nothing changes for them).
/// </summary>
public enum PlanApprovalStatus
{
    Approved = 0,
    Pending = 1,
    Returned = 2,
}
