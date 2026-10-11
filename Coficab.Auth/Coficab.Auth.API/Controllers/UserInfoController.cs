using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using OpenIddict.Server.AspNetCore;
using Coficab.Auth.API.Models;

[ApiController]
public class UserInfoController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;

    public UserInfoController(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    [Authorize(AuthenticationSchemes = OpenIddictServerAspNetCoreDefaults.AuthenticationScheme)]
    [HttpGet("~/connect/userinfo")]
    public async Task<IActionResult> UserInfo()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge(OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

        var roles = await _userManager.GetRolesAsync(user);

        return Ok(new
        {
            sub = user.Id,
            email = user.Email,
            name = user.UserName,
            department = user.Department,
            role = roles,
        });
    }
}