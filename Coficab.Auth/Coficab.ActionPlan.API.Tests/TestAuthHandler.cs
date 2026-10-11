using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>
/// Auth scheme for integration tests: a fixed superadmin by default. A request can set
/// <see cref="RoleHeader"/> to another role, or to <see cref="Anonymous"/> to send no identity.
/// </summary>
public sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "Test";
    public const string RoleHeader = "X-Test-Role";
    /// <summary>Overrides the user id, for tests that need two different people (e.g. admin and employee).</summary>
    public const string UserIdHeader = "X-Test-UserId";
    public const string Anonymous = "anonymous";
    public static readonly Guid TestUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var role = Request.Headers[RoleHeader].ToString();
        if (role == Anonymous)
            return Task.FromResult(AuthenticateResult.NoResult());
        if (role.Length == 0)
            role = "superadmin";

        var userId = Request.Headers[UserIdHeader].ToString();
        if (userId.Length == 0)
            userId = TestUserId.ToString();

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim("sub", userId),
            new Claim(ClaimTypes.Email, "superadmin@coficab.com"),
            new Claim(ClaimTypes.Role, role),
            new Claim("role", role),
        };
        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
