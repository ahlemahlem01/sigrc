namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class FiveWhySuggestionDto
{
    public string Category { get; set; } = string.Empty;
    public string CauseDescription { get; set; } = string.Empty;
    public bool IsRootCause { get; set; }
    public Guid? FiveWhyStepId { get; set; }
    public int? FiveWhyStepIndex { get; set; }
    public double? Confidence { get; set; }
}