namespace Coficab.ActionPlan.Application.DTOs.Pareto;

public class ParetoSuggestRequestDto
{
    public string? DefectType { get; set; }
    public string? ProductionLine { get; set; }
    public string? ClientId { get; set; }
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
}

public class ParetoSuggestionDto
{
    public bool HasData { get; set; }
    /// <summary>True when history is too thin for a reliable recommendation (manual use stays possible).</summary>
    public bool InsufficientData { get; set; }
    /// <summary>Enough data, but no axis differs significantly from the usual distribution.</summary>
    public bool NoPattern { get; set; }
    public int MinSample { get; set; }
    public string RecommendedDimension { get; set; } = string.Empty;
    public string RecommendedMode { get; set; } = string.Empty;
    public string RecommendedLabel { get; set; } = string.Empty;
    public string Explanation { get; set; } = string.Empty;
    public string? TopCategory { get; set; }
    public double TopPercentage { get; set; }
    public int SampleSize { get; set; }
    public double ConfidenceScore { get; set; }
    public List<ParetoItemDto> Items { get; set; } = new();
    public List<ParetoCandidateDto> Candidates { get; set; } = new();
}

public class ParetoCandidateDto
{
    public string Dimension { get; set; } = string.Empty;
    public string Mode { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? TopCategory { get; set; }
    public double TopPercentage { get; set; }
    public int SampleSize { get; set; }
    public double Score { get; set; }
    public List<ParetoItemDto> Items { get; set; } = new();
}
