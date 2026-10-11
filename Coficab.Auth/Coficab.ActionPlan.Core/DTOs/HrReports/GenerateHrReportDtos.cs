namespace Coficab.ActionPlan.Core.DTOs.HrReports;

public class GenerateHrReportRequest
{
    public DateTime? PeriodStart { get; set; }
    public DateTime? PeriodEnd { get; set; }
    public string? Department { get; set; }
    public List<HrReportEmployeePayload> Employees { get; set; } = new();
}

public class HrReportEmployeePayload
{
    public string UserId { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string ActivityStatus { get; set; } = string.Empty;
    public int ActiveDossiers { get; set; }
    public int RemainingCapacity { get; set; }
    public int ClosureRate { get; set; }
    public int OverdueCount { get; set; }
    public double AvgDelayDays { get; set; }
    public string Workload { get; set; } = string.Empty;
    public int RecentActionCount { get; set; }
    public Dictionary<string, string> CompetencyLevels { get; set; } = new();
    public List<string> Badges { get; set; } = new();
    public List<string> TimelineHighlights { get; set; } = new();
}

public class GenerateHrReportResponse
{
    public string Summary { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public int EmployeeCount { get; set; }
}
