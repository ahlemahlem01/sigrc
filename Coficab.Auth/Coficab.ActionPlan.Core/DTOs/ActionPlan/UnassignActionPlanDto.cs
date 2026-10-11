using System.ComponentModel.DataAnnotations;

namespace Coficab.ActionPlan.Core.DTOs.ActionPlan;

public class UnassignActionPlanDto
{
    [Required] public string UserId { get; set; } = null!;
    [Required] public string ActionPlanId { get; set; } = null!;
}