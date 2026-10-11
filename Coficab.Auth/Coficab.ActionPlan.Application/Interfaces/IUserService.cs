
namespace Coficab.ActionPlan.Application.Interfaces;

public interface IUserService
{
    Task<bool> UserExistsAsync(Guid userId);
    Task<bool> UserExistsAsync(string userId);
}