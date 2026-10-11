using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Coficab.Auth.API.Services;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OpenIddict.Abstractions;
using OpenIddict.Server.AspNetCore;
using OpenIddict.Validation.AspNetCore;
using System.Security.Claims;

namespace Coficab.Auth.API.Controllers;

[ApiController]
public class AuthorizationController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly AppDbContext _db;
    private readonly EmailService _emailService;
    private readonly AuditService _auditService;

    public AuthorizationController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        AppDbContext db,
        EmailService emailService,
        AuditService auditService)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _db = db;
        _emailService = emailService;
        _auditService = auditService;
    }

    [HttpPost("~/connect/token")]
    public async Task<IActionResult> Exchange()
    {
        var request = HttpContext.GetOpenIddictServerRequest()
            ?? throw new InvalidOperationException("The OpenIddict request cannot be retrieved.");

        if (request.IsPasswordGrantType())
        {
            var user = await _userManager.FindByEmailAsync(request.Username ?? "");
            if (user == null)
                return Forbid(
                    CreateErrorProperties("The email or password is incorrect."),
                    OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

            // Snapshot lockout state BEFORE the sign-in attempt
            var alreadyLocked = await _userManager.IsLockedOutAsync(user);

            var result = await _signInManager.CheckPasswordSignInAsync(
                user, request.Password ?? "", lockoutOnFailure: true);

            if (result.IsLockedOut && !alreadyLocked)
            {
                // Account just got locked on this attempt
                var lockoutEnd = await _userManager.GetLockoutEndDateAsync(user)
                                 ?? DateTimeOffset.UtcNow.AddMinutes(15);

                try
                {
                    await _emailService.SendLockoutEmailAsync(
                        user.Email!, user.FullName, lockoutEnd);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine(
                        $"[AuthorizationController] Lockout email failed for {user.Email}: {ex.Message}");
                }

                await _auditService.LogAsync(
                    action: "LOCKOUT",
                    targetEmail: user.Email!,
                    detail: $"Account locked until {lockoutEnd:dd/MM/yyyy HH:mm} UTC after too many failed attempts.");
            }

            if (!result.Succeeded)
                return Forbid(
                    CreateErrorProperties("The email or password is incorrect."),
                    OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

            // Successful login
            user.LastLoginAt = DateTime.UtcNow;
            await _userManager.UpdateAsync(user);

            await _auditService.LogAsync(
                action: "LOGIN",
                targetEmail: user.Email!,
                actorId: user.Id,
                actorEmail: user.Email!,
                detail: $"Connexion réussie · {user.FullName ?? user.Email}");

            var principal = await BuildClaimsPrincipal(user, request.GetScopes());
            return SignIn(principal, OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
        }

        if (request.IsRefreshTokenGrantType())
        {
            var result = await HttpContext.AuthenticateAsync(
                OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

            var user = await _userManager.FindByIdAsync(
                result.Principal?.GetClaim(OpenIddictConstants.Claims.Subject) ?? "");

            if (user == null)
                return Forbid(
                    CreateErrorProperties("The refresh token is no longer valid."),
                    OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

            var principal = await BuildClaimsPrincipal(
                user, result.Principal?.GetScopes() ?? []);

            return SignIn(principal, OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
        }

        throw new InvalidOperationException("The specified grant type is not supported.");
    }

    private async Task<ClaimsPrincipal> BuildClaimsPrincipal(
        ApplicationUser user,
        IEnumerable<string> scopes)
    {
        var identity = new ClaimsIdentity(
            authenticationType: TokenValidationParameters.DefaultAuthenticationType,
            nameType: OpenIddictConstants.Claims.Name,
            roleType: OpenIddictConstants.Claims.Role);

        identity.AddClaim(OpenIddictConstants.Claims.Subject, user.Id);
        identity.AddClaim(OpenIddictConstants.Claims.Email, user.Email ?? "");
        identity.AddClaim(OpenIddictConstants.Claims.Name, user.FullName);
        identity.AddClaim("department", user.Department);

        var roles = await _userManager.GetRolesAsync(user);
        foreach (var role in roles)
            identity.AddClaim(OpenIddictConstants.Claims.Role, role);

        var permissions = await _db.UserPermissions
            .Include(up => up.Permission)
            .Where(up => up.UserId == user.Id && up.IsGranted)
            .Select(up => up.Permission.Name)
            .ToListAsync();

        foreach (var permission in permissions)
            identity.AddClaim("permission", permission);

        identity.SetDestinations(claim => claim.Type switch
        {
            OpenIddictConstants.Claims.Name or
            OpenIddictConstants.Claims.Email or
            OpenIddictConstants.Claims.Role or
            "department" or
            "permission" => [
                OpenIddictConstants.Destinations.AccessToken,
                OpenIddictConstants.Destinations.IdentityToken],
            _ => [OpenIddictConstants.Destinations.AccessToken]
        });

        var principal = new ClaimsPrincipal(identity);
        principal.SetScopes(scopes);
        principal.SetAudiences("coficab-action-plan-api");
        return principal;
    }

    private static AuthenticationProperties CreateErrorProperties(string description)
    {
        return new AuthenticationProperties(new Dictionary<string, string?>
        {
            [OpenIddictServerAspNetCoreConstants.Properties.Error] =
                OpenIddictConstants.Errors.InvalidGrant,
            [OpenIddictServerAspNetCoreConstants.Properties.ErrorDescription] =
                description
        });
    }

    [HttpGet("~/connect/userinfo")]
    public async Task<IActionResult> Userinfo()
    {
        var result = await HttpContext.AuthenticateAsync(
            OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

        var user = await _userManager.FindByIdAsync(
            result.Principal?.GetClaim(OpenIddictConstants.Claims.Subject) ?? "");

        if (user == null)
            return Challenge(OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

        var roles = await _userManager.GetRolesAsync(user);
        var permissions = await _db.UserPermissions
            .Include(up => up.Permission)
            .Where(up => up.UserId == user.Id && up.IsGranted)
            .Select(up => up.Permission.Name)
            .ToListAsync();

        return Ok(new
        {
            sub = user.Id,
            email = user.Email,
            name = user.FullName,
            department = user.Department,
            organizationId = user.OrganizationId,
            role = roles,
            permission = permissions
        });
    }

    [HttpGet("~/api/me")]
    [Authorize(AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
    public async Task<IActionResult> Me()
    {
        var user = await _userManager.FindByIdAsync(
            User.GetClaim(OpenIddictConstants.Claims.Subject) ?? "");

        if (user == null) return Unauthorized();

        var roles = await _userManager.GetRolesAsync(user);
        var permissions = await _db.UserPermissions
            .Include(up => up.Permission)
            .Where(up => up.UserId == user.Id && up.IsGranted)
            .Select(up => up.Permission.Name)
            .ToListAsync();

        return Ok(new
        {
            sub = user.Id,
            email = user.Email,
            name = user.FullName,
            department = user.Department,
            organizationId = user.OrganizationId,
            role = roles,
            permission = permissions
        });
    }
}