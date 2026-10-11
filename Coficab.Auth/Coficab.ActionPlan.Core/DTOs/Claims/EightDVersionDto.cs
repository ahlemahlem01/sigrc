namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class EightDVersionSummaryDto
{
    public int Version { get; set; }
    public string EventType { get; set; } = string.Empty;
    public DateTime SavedAt { get; set; }
    public string? SavedById { get; set; }
    public string? SavedByName { get; set; }
    public string StatusCode { get; set; } = string.Empty;
    public int CurrentStep { get; set; }
    public List<string> ChangedFields { get; set; } = new();
    public string? Comment { get; set; }
    public bool IsCurrent { get; set; }
}

public class EightDFieldChangeDto
{
    public string Field { get; set; } = string.Empty;

    /// <summary>The 8D step the field belongs to (1, 3, 6, 7, 8), or 0 for status and validation.</summary>
    public int Step { get; set; }

    public string? Before { get; set; }
    public string? After { get; set; }
}

public class EightDVersionDetailDto : EightDVersionSummaryDto
{
    /// <summary>What changed compared with the previous version (everything non-empty for the first one).</summary>
    public List<EightDFieldChangeDto> Changes { get; set; } = new();
}
