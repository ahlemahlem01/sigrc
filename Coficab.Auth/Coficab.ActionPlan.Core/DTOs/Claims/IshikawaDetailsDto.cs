namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class IshikawaCauseDto
{
    public Guid Id { get; set; }
    public string Text { get; set; } = string.Empty;
    public bool IsRootCause { get; set; }
    /// <summary>The analyst's estimate for the prospective Pareto (1 to 10 each); null until the cause is scored.</summary>
    public int? RiskSeverity { get; set; }
    public int? RiskOccurrence { get; set; }
    public int? RiskDetection { get; set; }
}

public class IshikawaCategoryDto
{
    public Guid Id { get; set; }
    public string CategoryName { get; set; } = string.Empty; // e.g., Manpower, Machine, Material, Method, Measurement, Environment
    public List<IshikawaCauseDto> Causes { get; set; } = new();
}

public class IshikawaDetailsDto
{
    public Guid Id { get; set; }
    public Guid ClaimId { get; set; }
    public string ProblemStatement { get; set; } = string.Empty;
    public string StatusCode { get; set; } = "DRAFT";
    public bool IsValidated { get; set; }
    public string? ValidatedBy { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public List<IshikawaCategoryDto> Categories { get; set; } = new();
}