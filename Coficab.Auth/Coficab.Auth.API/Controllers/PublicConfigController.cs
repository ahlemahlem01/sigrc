using Coficab.Auth.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.Auth.API.Controllers;

/// <summary>What the sign-in pages need to know before anyone is signed in.</summary>
[ApiController]
[Route("api/public")]
[AllowAnonymous]
public class PublicConfigController : ControllerBase
{
    private readonly ITurnstileVerifier _turnstile;

    public PublicConfigController(ITurnstileVerifier turnstile) => _turnstile = turnstile;

    /// <summary>Whether the Cloudflare Turnstile check is on, and the public key of its widget (the secret never leaves the server).</summary>
    [HttpGet("turnstile")]
    public IActionResult Turnstile() => Ok(new { enabled = _turnstile.Enabled && !string.IsNullOrWhiteSpace(_turnstile.SiteKey), siteKey = _turnstile.SiteKey });
}
