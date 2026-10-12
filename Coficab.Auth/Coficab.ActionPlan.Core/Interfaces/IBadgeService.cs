namespace Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;
public interface IBadgeService
{
    Task<IEnumerable<BadgeDto>> GetUserBadgesAsync(string userId);
    Task<BadgeDto?> AwardBadgeAsync(string userId, AwardBadgeDto dto);
    Task<bool> HasBadgeAsync(string userId, string badgeCategory);
    /// <summary>Awards every automatic badge the employee has earned so far (speed tiers, streaks, perfect quarters, reliability).</summary>
    Task<IReadOnlyList<BadgeDto>> AwardEarnedAsync(string userId);
    /// <summary>Same, for every employee who has closed claims (catch-up after the rules changed). Only adds badges.</summary>
    Task<IReadOnlyList<BadgeDto>> AwardEarnedForEveryoneAsync();
    Task<IEnumerable<BadgeDto>> GetAllBadgesAsync(); // admin view
    Task<BadgeDto> CreateAsync(CreateBadgeDto dto);
    Task DeleteAsync(Guid id);
    
}