using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.DTOs.Ishikawa;

public enum IshikawaProbabilityTier
{
    Red,
    Yellow,
    Green
}

public class SuggestIshikawaCausesRequestDto
{
    public Guid ClaimId { get; set; }
    /// <summary>Barre / catégorie validée du Pareto (machine, client, défaut…).</summary>
    public string? ParetoVitalFew { get; set; }
}

public class SuggestIshikawaCausesResponseDto
{
    public Guid ClaimId { get; set; }
    public string? DefectType { get; set; }
    public string? ProductionLine { get; set; }
    public string? ParetoVitalFew { get; set; }
    public string Explanation { get; set; } = string.Empty;
    public List<SuggestedIshikawaCauseDto> Items { get; set; } = new();
}

public class SuggestedIshikawaCauseDto
{
    public IshikawaCategory Category { get; set; }
    public string CauseDescription { get; set; } = string.Empty;
    public IshikawaProbabilityTier ProbabilityTier { get; set; }
    public string TierLabel { get; set; } = string.Empty;
    public string Rationale { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty; // HISTORICAL | INDUSTRY | HYPOTHESIS
    public int HistoricalCount { get; set; }
    public double Confidence { get; set; }
    public bool IsRootCauseCandidate { get; set; }
}
