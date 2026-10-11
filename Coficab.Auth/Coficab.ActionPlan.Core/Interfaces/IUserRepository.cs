
namespace Coficab.ActionPlan.Core.Interfaces;

public interface IUserRepository
{
    Task<bool> ExistsAsync(Guid userId);
    Task<bool> ExistsAsync(string userId);
    Task<IEnumerable<string>> GetUserIdsByRoleAsync(string role);
    
    Task<string?> GetUserNameByIdAsync(string userId);
}