namespace Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;

public interface ITimelineService
{
    Task<IEnumerable<TimelineEventDto>> GetUserTimelineAsync(string userId, int count = 20);
    Task<IEnumerable<TimelineEventDto>> GetAllTimelineAsync(int count = 50); // ← nouveau
    Task<TimelineEventDto> AddEventAsync(string userId, CreateTimelineEventDto dto);
    Task AutoLogPlanCompletedAsync(string userId, Guid planId, string planTitle);
    Task AutoLogPlanAssignedAsync(string userId, Guid planId, string planTitle);
    Task AutoLogBadgeEarnedAsync(string userId, Guid badgeId, string badgeName);
    Task<TimelineEventDto> CreateAsync(CreateTimelineEventDto dto);
    Task DeleteAsync(Guid id);
}