namespace Coficab.ActionPlan.Core.Enums;

/// <summary>
/// Statut d'activité métier (indépendant du verrouillage de compte IAM).
/// Active ≤15 j, LowActivity 15–60 j, Inactive 60+ j.
/// </summary>
public enum ActivityStatus
{
    Active = 0,
    LowActivity = 1,
    Inactive = 2,
}
