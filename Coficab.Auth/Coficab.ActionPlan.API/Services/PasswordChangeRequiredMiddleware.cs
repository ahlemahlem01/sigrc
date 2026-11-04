namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Status "reinitialized" of the specification, enforced here and not only on the screen: a token issued while the password is
/// still a temporary one carries the claim <c>pwd_change</c>, and with it nothing is served until the person has chosen his own
/// password (he then signs in again and gets a token without the claim).
/// </summary>
public class PasswordChangeRequiredMiddleware
{
    public const string ClaimType = "pwd_change";
    private readonly RequestDelegate _next;

    public PasswordChangeRequiredMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true && context.User.HasClaim(ClaimType, "1")
            && !context.Request.Path.StartsWithSegments("/health"))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { code = "password_change_required", message = "Choisissez votre mot de passe avant de continuer." });
            return;
        }
        await _next(context);
    }
}
