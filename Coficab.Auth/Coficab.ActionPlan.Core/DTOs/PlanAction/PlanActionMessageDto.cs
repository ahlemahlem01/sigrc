namespace Coficab.ActionPlan.Core.DTOs.PlanAction;

/// <summary>A message written by an administrator about a sub-action (rejection reason or warning).</summary>
public class PlanActionMessageDto
{
    public string Message { get; set; } = string.Empty;
}
