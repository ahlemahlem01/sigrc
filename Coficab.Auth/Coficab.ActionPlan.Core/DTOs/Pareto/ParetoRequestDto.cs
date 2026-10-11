namespace Coficab.ActionPlan.Application.DTOs.Pareto;

public class ParetoRequestDto
{
    public ParetoDimension Dimension { get; set; } = ParetoDimension.DefectType;
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public string? ClientId { get; set; }
    public string? ProductionLine { get; set; }
    public string? DefectType { get; set; }
    /// <summary>"count" (default) ranks by number of dossiers, "impact" by defective quantity × severity.</summary>
    public string? Measure { get; set; }
}