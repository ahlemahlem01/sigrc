namespace Coficab.ActionPlan.Core.Entities;

public class IshikawaAnalysis
{
    public Guid Id { get; set; }
    public Guid ClaimId { get; set; }
    public string ProblemStatement { get; set; } = string.Empty;
    public string StatusCode { get; set; } = "DRAFT";
    public bool IsValidated { get; set; }
    public string? ValidatedBy { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public bool IsArchived { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;

    // Navigation property
    public List<IshikawaCategory> Categories { get; set; } = new();
}