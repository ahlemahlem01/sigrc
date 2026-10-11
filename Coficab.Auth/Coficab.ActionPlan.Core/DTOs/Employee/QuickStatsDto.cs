namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class QuickStatsDto
{
    public int TotalPlans { get; set; }
    public int Completed { get; set; }
    public int OnTimeRate { get; set; }
    public int WeeklyStreak { get; set; }
    public int BadgesCount { get; set; }
    public int FastCompletions { get; set; }
}