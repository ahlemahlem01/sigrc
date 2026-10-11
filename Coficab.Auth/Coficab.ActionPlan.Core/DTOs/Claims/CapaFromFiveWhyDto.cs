namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class SuggestCapaRequestDto
{
    public string ProblemStatement { get; set; } = string.Empty;
    public string RootCauseOccurrence { get; set; } = string.Empty;
    public string RootCauseDetection { get; set; } = string.Empty;
    public string? ClaimTitle { get; set; }
}

public class SuggestedCapaActionDto
{
    /// <summary>CORRECTIVE | PREVENTIVE</summary>
    public string Kind { get; set; } = "CORRECTIVE";
    /// <summary>OCCURRENCE | DETECTION</summary>
    public string Branch { get; set; } = "OCCURRENCE";
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Priority { get; set; } = 1;
    public int SuggestedDeadlineDays { get; set; } = 14;
}

public class SuggestCapaResponseDto
{
    public string PlanTitle { get; set; } = string.Empty;
    public string PlanDescription { get; set; } = string.Empty;
    public List<SuggestedCapaActionDto> Actions { get; set; } = new();
}

public class CreateCapaFromFiveWhyRequestDto
{
    public string? PlanTitle { get; set; }
    public string? PlanDescription { get; set; }
    public Guid? OrganizationId { get; set; }
    public Guid? DepartmentId { get; set; }
    public string? AssignedToId { get; set; }
    public DateTime? Deadline { get; set; }
    public List<SuggestedCapaActionDto> Actions { get; set; } = new();
}
