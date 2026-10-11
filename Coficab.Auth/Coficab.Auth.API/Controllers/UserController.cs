using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using OpenIddict.Validation.AspNetCore;

namespace Coficab.Auth.API.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
public class UserController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<IdentityRole> _roleManager;

    public UserController(
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager)
    {
        _userManager = userManager;
        _roleManager = roleManager;
    }

    // GET api/users — admin only
    [HttpGet]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetAll()
    {
        var users = _userManager.Users.ToList();
        var result = new List<object>();

        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            result.Add(new
            {
                user.Id,
                user.FullName,
                user.Email,
                user.Department,
                Roles = roles
            });
        }

        return Ok(result);
    }

    // GET api/users/{id} — any authenticated user
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found" });

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new
        {
            user.Id,
            user.FullName,
            user.Email,
            user.Department,
            Roles = roles
        });
    }

    // POST api/users — admin only
    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        if (await _userManager.FindByEmailAsync(request.Email) != null)
            return BadRequest(new { message = "Email already exists" });

        if (!await _roleManager.RoleExistsAsync(request.Role))
            return BadRequest(new { message = $"Role '{request.Role}' does not exist" });

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FullName = request.FullName,
            Department = request.Department
        };

        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
            return BadRequest(result.Errors);

        await _userManager.AddToRoleAsync(user, request.Role);

        return Ok(new { message = "User created successfully", userId = user.Id });
    }

    // PUT api/users/{id} — admin only
    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateUserRequest request)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found" });

        user.FullName = request.FullName;
        user.Department = request.Department;

        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
            return BadRequest(result.Errors);

        return Ok(new { message = "User updated successfully" });
    }

    // DELETE api/users/{id} — admin only
    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found" });

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
            return BadRequest(result.Errors);

        return Ok(new { message = "User deleted successfully" });
    }

    // POST api/users/{id}/roles — admin only
    [HttpPost("{id}/roles")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AssignRole(string id, [FromBody] AssignRoleRequest request)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found" });

        if (!await _roleManager.RoleExistsAsync(request.Role))
            return BadRequest(new { message = $"Role '{request.Role}' does not exist" });

        if (await _userManager.IsInRoleAsync(user, request.Role))
            return BadRequest(new { message = "User already has this role" });

        await _userManager.AddToRoleAsync(user, request.Role);
        return Ok(new { message = $"Role '{request.Role}' assigned successfully" });
    }

    // DELETE api/users/{id}/roles — admin only
    [HttpDelete("{id}/roles")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> RemoveRole(string id, [FromBody] AssignRoleRequest request)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found" });

        if (!await _userManager.IsInRoleAsync(user, request.Role))
            return BadRequest(new { message = "User does not have this role" });

        await _userManager.RemoveFromRoleAsync(user, request.Role);
        return Ok(new { message = $"Role '{request.Role}' removed successfully" });
    }

    // GET api/users/roles — any authenticated user
    [HttpGet("roles")]
    public IActionResult GetRoles()
    {
        var roles = _roleManager.Roles.Select(r => r.Name).ToList();
        return Ok(roles);
    }
}

public record CreateUserRequest(
    string FullName,
    string Email,
    string Password,
    string Department,
    string Role
);

public record UpdateUserRequest(
    string FullName,
    string Department
);

public record AssignRoleRequest(
    string Role
);