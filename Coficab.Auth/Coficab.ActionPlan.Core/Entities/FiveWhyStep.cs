namespace Coficab.ActionPlan.Core.Entities;

public class FiveWhyStep
{
    public Guid Id { get; set; }
    public Guid AnalysisId { get; set; }
    public int StepNumber { get; set; }
    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
}