// Application/Services/UserService.cs
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Interfaces;

namespace Coficab.ActionPlan.Application.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _userRepository;

    public UserService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    public async Task<bool> UserExistsAsync(Guid userId)
    {
        return await _userRepository.ExistsAsync(userId);
    }

    public async Task<bool> UserExistsAsync(string userId)
    {
        return await _userRepository.ExistsAsync(userId);
    }
}