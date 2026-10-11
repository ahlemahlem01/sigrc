namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class ParetoCategoryDto
{
    public string CategoryName { get; set; } = string.Empty;
    public int Count { get; set; }
    public double Percentage { get; set; }
    public double CumulativePercentage { get; set; }
}

public class ParetoReportDto
{
    public List<ParetoCategoryDto> Categories { get; set; } = new();
}