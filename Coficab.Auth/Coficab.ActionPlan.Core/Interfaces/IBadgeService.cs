namespace Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;
public interface IBadgeService
{
    Task<IEnumerable<BadgeDto>> GetUserBadgesAsync(string userId);
    Task<BadgeDto?> AwardBadgeAsync(string userId, AwardBadgeDto dto);
    Task<bool> HasBadgeAsync(string userId, string badgeCategory);
    Task<IEnumerable<BadgeDto>> GetAllBadgesAsync(); // admin view
    Task<BadgeDto> CreateAsync(CreateBadgeDto dto);
    Task DeleteAsync(Guid id);
    
}