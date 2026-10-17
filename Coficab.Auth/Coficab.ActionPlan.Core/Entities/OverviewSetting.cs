namespace Coficab.ActionPlan.Core.Entities;

/// <summary>A numeric setting of the management overview (the targets its traffic lights are compared with).</summary>
public class OverviewSetting
{
    public string Key { get; set; } = string.Empty;
    public double Value { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}
