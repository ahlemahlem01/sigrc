using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Coficab.Auth.API.Services;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    private readonly ITurnstileVerifier _turnstile;

    public AuthorizationController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        AppDbContext db,
        EmailService emailService,
        AuditService auditService,
        ITurnstileVerifier turnstile)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _db = db;
        _emailService = emailService;
        _auditService = auditService;
        _turnstile = turnstile;
    }

    /// <summary>A short, one-way fingerprint of the security stamp: it travels in the tokens so that a password reset or a lockout can cancel them, without exposing the stamp.</summary>
    internal static string StampFingerprint(string? stamp) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(stamp ?? string.Empty)))[..16];

    [HttpPost("~/connect/token")]
    [EnableRateLimiting("token")]
    public async Task<IActionResult> Exchange()
    {
        var request = HttpContext.GetOpenIddictServerRequest()
            ?? throw new InvalidOperationException("The OpenIddict request cannot be retrieved.");

        if (request.IsPasswordGrantType())
        {
            // Cloudflare Turnstile (when switched on): checked before anything about the account is looked at or counted, so a bot
            // neither learns nor locks anything. A refresh does not need it (it carries no password).
            if (_turnstile.Enabled && !await _turnstile.VerifyAsync(request.GetParameter("cf-turnstile-response")?.ToString(), HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.RequestAborted))
            {
                await _auditService.LogAsync(action: "CAPTCHA_FAILED", targetEmail: request.Username ?? string.Empty, detail: "Vérification Turnstile refusée à la connexion.");
                return Forbid(
                    CreateErrorProperties("The verification failed. Please try again.", "captcha_failed"),
                    OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
            }

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

            if (result.IsLockedOut)
            {
                var until = await _userManager.GetLockoutEndDateAsync(user);
                return Forbid(
                    CreateErrorProperties(
                        $"The account is locked after too many failed attempts{(until.HasValue && until.Value < DateTimeOffset.UtcNow.AddYears(1) ? $" until {until.Value.UtcDateTime:HH:mm} UTC" : "")}.",
                        "account_locked"),
                    OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
            }

            if (!result.Succeeded)
            {
                await _auditService.LogAsync(
                    action: "LOGIN_FAILED",
                    targetEmail: user.Email!,
                    detail: "Mot de passe incorrect.");
                return Forbid(
                    CreateErrorProperties("The email or password is incorrect."),
                    OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
            }

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

            // A refresh is a new sign-in: a locked account does not get one, and neither does a session opened before the password
            // was reset (the security stamp changed) or before the stamp was carried in the tokens at all.
            if (await _userManager.IsLockedOutAsync(user))
                return Forbid(
                    CreateErrorProperties("The account is locked.", "account_locked"),
                    OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);

            var carried = result.Principal?.GetClaim("sst");
            if (carried is null || !string.Equals(carried, StampFingerprint(await _userManager.GetSecurityStampAsync(user)), StringComparison.Ordinal))
                return Forbid(
                    CreateErrorProperties("The session is no longer valid. Please sign in again."),
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
        identity.AddClaim("sst", StampFingerprint(await _userManager.GetSecurityStampAsync(user)));

        var roles = await _userManager.GetRolesAsync(user);
        foreach (var role in roles)
            identity.AddClaim(OpenIddictConstants.Claims.Role, role);

        var permissions = await _db.UserPermissions
            .Include(up => up.Permission)
            .Where(up => up.UserId == user.Id && up.IsGranted)
            .Select(up => up.Permission.Name)
            .ToListAsync();

        // the rights of the role, plus those granted one by one from the permission matrix
        foreach (var permission in permissions.Concat(Coficab.Auth.API.Data.RolePermissionDefaults.For(roles)).Distinct(StringComparer.OrdinalIgnoreCase))
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

    private static AuthenticationProperties CreateErrorProperties(string description, string error = OpenIddictConstants.Errors.InvalidGrant)
    {
        return new AuthenticationProperties(new Dictionary<string, string?>
        {
            [OpenIddictServerAspNetCoreConstants.Properties.Error] = error,
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