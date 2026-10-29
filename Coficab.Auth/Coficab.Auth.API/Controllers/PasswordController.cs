using System.Diagnostics;
using System.Runtime.CompilerServices;
using Coficab.Auth.API.Models;
using Coficab.Auth.API.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Coficab.Auth.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PasswordController : ControllerBase
{
    /// <summary>Same answer for an unknown e-mail, a wrong token, an expired one or one already used: nothing tells them apart.</summary>
    public const string InvalidLink = "invalid_link";
    public const string WeakPassword = "weak_password";

    /// <summary>At most this many reset e-mails per account and hour (a mailbox cannot be flooded through this form).</summary>
    private const int MaxEmailsPerAccountPerHour = 3;

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IServiceScopeFactory _scopes;
    private readonly AuditService _audit;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _config;
    private readonly IOptions<DataProtectionTokenProviderOptions> _tokenOptions;
    private readonly ILogger<PasswordController> _logger;
    private readonly ITurnstileVerifier _turnstile;

    public PasswordController(
        UserManager<ApplicationUser> userManager,
        IServiceScopeFactory scopes,
        AuditService audit,
        IMemoryCache cache,
        IConfiguration config,
        IOptions<DataProtectionTokenProviderOptions> tokenOptions,
        ILogger<PasswordController> logger,
        ITurnstileVerifier turnstile)
    {
        _userManager = userManager;
        _scopes = scopes;
        _audit = audit;
        _cache = cache;
        _config = config;
        _tokenOptions = tokenOptions;
        _logger = logger;
        _turnstile = turnstile;
    }

    // POST /api/password/forgot
    [HttpPost("forgot")]
    [EnableRateLimiting("forgot")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var clock = Stopwatch.StartNew();
        try
        {
            // Turnstile (when switched on) comes first: a missing or refused check says nothing about the account
            if (_turnstile.Enabled && !await _turnstile.VerifyAsync(request.TurnstileToken, HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.RequestAborted))
                return BadRequest(new { code = "captcha_failed" });

            var email = (request.Email ?? string.Empty).Trim();
            var user = email.Length == 0 ? null : await _userManager.FindByEmailAsync(email);
            if (user?.Email is not null && WithinMailQuota(user.Id))
            {
                var token = await _userManager.GeneratePasswordResetTokenAsync(user);
                var frontendUrl = (_config["Frontend:Url"] ?? "http://localhost:3000").TrimEnd('/');
                // both parts are encoded (an address with a "+" would otherwise lose it) and the address is the one of the account
                var link = $"{frontendUrl}/reset-password?email={Uri.EscapeDataString(user.Email)}&token={Uri.EscapeDataString(token)}";
                var minutes = (int)Math.Round(_tokenOptions.Value.TokenLifespan.TotalMinutes);

                QueueMail(mail => mail.SendResetPasswordEmailAsync(user.Email, link, minutes), user.Email);
                await _audit.LogAsync("PASSWORD_RESET_REQUESTED", user.Email, detail: "Lien de réinitialisation envoyé.");
            }
            return Ok();   // always the same answer
        }
        finally
        {
            // the same minimum duration whether the account exists or not: the time taken tells nothing
            var wait = TimeSpan.FromMilliseconds(_config.GetValue("Auth:ForgotMinimumMs", 250)) - clock.Elapsed;
            if (wait > TimeSpan.Zero) await Task.Delay(wait);
        }
    }

    // POST /api/password/reset
    [HttpPost("reset")]
    [EnableRateLimiting("reset")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var user = string.IsNullOrWhiteSpace(request.Email) ? null : await _userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null || string.IsNullOrWhiteSpace(request.Token))
            return BadRequest(new { code = InvalidLink, message = (string?)null });

        var result = await _userManager.ResetPasswordAsync(user, request.Token, request.NewPassword ?? string.Empty);
        if (!result.Succeeded)
        {
            // Only the password rules are explained (the holder of a valid token may know them); everything else is just "invalid link".
            var rules = result.Errors.Where(e => e.Code.StartsWith("Password", StringComparison.Ordinal)).Select(e => e.Description).ToList();
            return BadRequest(rules.Count > 0 ? new { code = WeakPassword, message = string.Join(" ", rules) } : new { code = InvalidLink, message = (string?)null });
        }

        // Resetting the password is also the way out of a lockout; the security stamp changed, so every older session
        // (refresh tokens included) is refused from now on.
        await _userManager.ResetAccessFailedCountAsync(user);
        await _userManager.SetLockoutEndDateAsync(user, null);
        await _audit.LogAsync("PASSWORD_RESET", user.Email!, actorId: user.Id, actorEmail: user.Email!, detail: "Mot de passe réinitialisé par lien ; sessions précédentes fermées.");
        QueueMail(mail => mail.SendPasswordChangedEmailAsync(user.Email!, user.FullName), user.Email!);
        return Ok();
    }

    private bool WithinMailQuota(string userId)
    {
        var key = $"pwreset:{userId}";
        var sent = _cache.GetOrCreate(key, e => { e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1); return new StrongBox<int>(0); })!;
        lock (sent)
        {
            if (sent.Value >= _config.GetValue("Auth:ResetEmailsPerHour", MaxEmailsPerAccountPerHour)) return false;
            sent.Value++;
            return true;
        }
    }

    /// <summary>Sends in the background with its own scope: the answer never waits for the mail server, and a mail failure never shows to the caller.</summary>
    private void QueueMail(Func<EmailService, Task> send, string to)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopes.CreateScope();
                await send(scope.ServiceProvider.GetRequiredService<EmailService>());
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Mail to {To} was not sent", to);
            }
        });
    }
}

public record ForgotPasswordRequest(string Email, string? TurnstileToken = null);
public record ResetPasswordRequest(string Email, string Token, string NewPassword);
