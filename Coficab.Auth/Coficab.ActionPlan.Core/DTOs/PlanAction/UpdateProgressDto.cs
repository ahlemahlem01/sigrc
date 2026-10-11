// DTOs/PlanAction/UpdateProgressDto.cs
namespace Coficab.ActionPlan.Core.DTOs.PlanAction;

public record UpdateProgressDto(
    int Progress,
    string? Note = null
);

// DTOs/PlanAction/ProgressHistoryDto.cs
public record ProgressHistoryDto(
    Guid Id,
    Guid PlanActionId,
    string ChangedBy,
    string OldProgress,
    string NewProgress,
    DateTime ChangedAt,
    string? Note
);