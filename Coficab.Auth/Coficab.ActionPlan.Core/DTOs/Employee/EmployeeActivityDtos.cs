using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class EmployeeActivityItemDto
{
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public ActivityStatus ActivityStatus { get; set; }
    public DateTime? LastActivityAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime? LastBusinessActivityAt { get; set; }
    public DateTime? ActivityStatusComputedAt { get; set; }
    /// <summary>Nombre d'actions métier sur les 60 derniers jours (volume).</summary>
    public int RecentActionCount { get; set; }
}

public class EmployeeActivitySummaryDto
{
    public int Total { get; set; }
    public int Active { get; set; }
    public int LowActivity { get; set; }
    public int Inactive { get; set; }
    public DateTime? ComputedAt { get; set; }
    public IReadOnlyList<EmployeeActivityItemDto> Items { get; set; } = Array.Empty<EmployeeActivityItemDto>();
}
