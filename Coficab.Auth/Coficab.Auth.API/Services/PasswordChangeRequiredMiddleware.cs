using Microsoft.AspNetCore.Authentication;
using OpenIddict.Validation.AspNetCore;

namespace Coficab.Auth.API.Services;

/// <summary>
/// Status "reinitialized" of the specification, enforced here and not only on the screen: a token issued while the password is a
/// temporary one carries the claim <c>pwd_change</c>. With it, only the person's own data and the change of password are served.
/// </summary>
public class PasswordChangeRequiredMiddleware
{
    public const string ClaimType = "pwd_change";
    private static readonly string[] Allowed = { "/api/me", "/api/password/change", "/connect", "/.well-known", "/health" };
    private readonly RequestDelegate _next;

    public PasswordChangeRequiredMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // only requests that carry a bearer token are looked at
        if (context.Request.Headers.ContainsKey("Authorization")
            && !Allowed.Any(p => context.Request.Path.StartsWithSegments(p, StringComparison.OrdinalIgnoreCase)))
        {
            var result = await context.AuthenticateAsync(OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme);
            if (result.Succeeded && result.Principal!.HasClaim(ClaimType, "1"))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new { code = "password_change_required", message = "Choisissez votre mot de passe avant de continuer." });
                return;
            }
        }
        await _next(context);
    }
}
