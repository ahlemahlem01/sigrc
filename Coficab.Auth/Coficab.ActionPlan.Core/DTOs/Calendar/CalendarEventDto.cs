namespace Coficab.ActionPlan.Core.DTOs.Calendar;

public class CalendarEventDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public bool AllDay { get; set; }
    public string Source { get; set; } = "custom";
    public string EventType { get; set; } = "custom";
    public string Importance { get; set; } = "normal";
    public string? Color { get; set; }
    public Guid? ActionPlanId { get; set; }
    public Guid? ClaimId { get; set; }
    public string ExternalUid { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public bool IsCompanyWide { get; set; }
    public List<string> TargetUserIds { get; set; } = new();
    public List<Guid> TargetDepartmentIds { get; set; } = new();
    public DateTime CreatedAt { get; set; }
}

public class CreateCalendarEventDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public bool AllDay { get; set; }
    public string? Color { get; set; }
    public Guid? ActionPlanId { get; set; }
    public Guid? ClaimId { get; set; }
    public string? ExternalUid { get; set; }
    public string Source { get; set; } = "custom";
    public string EventType { get; set; } = "custom";
    /// <summary>normal | important | urgent</summary>
    public string Importance { get; set; } = "normal";
    public bool IsCompanyWide { get; set; } = true;
    public List<string>? TargetUserIds { get; set; }
    public List<Guid>? TargetDepartmentIds { get; set; }
}

public class UpdateCalendarEventDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public bool AllDay { get; set; }
    public string? Color { get; set; }
    public Guid? ActionPlanId { get; set; }
    public Guid? ClaimId { get; set; }
    public string EventType { get; set; } = "custom";
    public string Importance { get; set; } = "normal";
    public bool IsCompanyWide { get; set; } = true;
    public List<string>? TargetUserIds { get; set; }
    public List<Guid>? TargetDepartmentIds { get; set; }
}
