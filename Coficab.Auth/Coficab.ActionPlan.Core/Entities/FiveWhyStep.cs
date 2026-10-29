namespace Coficab.ActionPlan.Core.Entities;

public class FiveWhyStep
{
    public Guid Id { get; set; }
    public Guid AnalysisId { get; set; }
    public int StepNumber { get; set; }
    /// <summary>OCCURRENCE (why the defect appeared) or DETECTION (why it was not caught): each branch has its own 5 steps.</summary>
    public string BranchType { get; set; } = "OCCURRENCE";
    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
}