namespace Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;

public interface IUserProfileService
{
    Task<UserProfileDto?> GetByUserIdAsync(string userId);
    Task<UserProfileDto> CreateOrUpdateAsync(string userId, UpdateUserProfileDto dto);
    Task<bool> ExistsAsync(string userId);
    Task<IEnumerable<UserProfileDto>> GetAllAsync();                          // NEW
    Task<IEnumerable<TeamMemberDto>> GetTeamMembersAsync(string userId);         // NEW (already exists in your impl)
    Task<IEnumerable<TeamMemberDto>> GetByDepartmentAsync(Guid departmentId);   // NEW
    Task DeleteAsync(string userId);
    Task<UserProfileDto?> UpdateProfileAsync(string userId, UpdateUserProfileDto dto);// NEW
    Task<UserProfileDto> UpdateAvatarAsync(string userId, string avatarUrl);
    /// <summary>Puts the employee in another (non-archived) department. Nothing else on the profile changes.</summary>
    Task<DepartmentMoveResult> MoveToDepartmentAsync(string userId, Guid departmentId);
}