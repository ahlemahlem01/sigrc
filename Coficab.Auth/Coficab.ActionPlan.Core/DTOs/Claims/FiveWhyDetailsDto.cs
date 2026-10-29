namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class FiveWhyStepReadDto
{
    public Guid Id { get; set; }
    public int StepNumber { get; set; }
    public string BranchType { get; set; } = "OCCURRENCE";
    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
}

public class FiveWhyDetailsDto
{
    public Guid Id { get; set; }
    public Guid ClaimId { get; set; }
    public string ProblemStatement { get; set; } = string.Empty;
    public string? RootCause { get; set; }
    public string? RootCauseOccurrence { get; set; }
    public string? RootCauseDetection { get; set; }
    public string StatusCode { get; set; } = "DRAFT";
    public bool IsValidated { get; set; }
    public string? ValidatedBy { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public List<FiveWhyStepReadDto> Steps { get; set; } = new();
}