namespace Coficab.ActionPlan.Application.DTOs.Pareto;

public class ParetoItemDto
{
    public string Category { get; set; } = string.Empty;
    public int Count { get; set; }
    /// <summary>Defective quantity × severity weight (low 1, medium 2, high 3, critical 5).</summary>
    public double Impact { get; set; }
    public double Percentage { get; set; }
    public double CumulativePercentage { get; set; }
    public bool IsVitalFew { get; set; }
}