public class ActionPlanHistoryDto
{
    public string Id { get; set; } = "";
    public string ActionPlanId { get; set; } = "";
    public ActionPlanRefDto? ActionPlan { get; set; }
    public string ChangedBy { get; set; } = "";
    public string ActionType { get; set; } = "";
    public int? OldStatus { get; set; }
    public int? NewStatus { get; set; }
    public string? OldAssignedToId { get; set; }
    public string? NewAssignedToId { get; set; }
    public string? OldAssignedToName { get; set; }
    public string? NewAssignedToName { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? ChangedByName { get; set; }
}

public class ActionPlanRefDto
{
    public string Title { get; set; } = "";
    public string? Code { get; set; }
}