using System.Security.Claims;
using Coficab.ActionPlan.API.Services;
using Microsoft.AspNetCore.Http;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A token issued with a temporary password serves nothing until the person has chosen his own.</summary>
public class PasswordChangeRequiredTests
{
    private static async Task<(int Status, bool Reached)> Run(params Claim[] claims)
    {
        var context = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) };
        context.Response.Body = new MemoryStream();
        var reached = false;
        var middleware = new PasswordChangeRequiredMiddleware(_ => { reached = true; return Task.CompletedTask; });
        await middleware.InvokeAsync(context);
        return (context.Response.StatusCode, reached);
    }

    [Fact]
    public async Task ATemporaryPassword_IsRefused()
    {
        var (status, reached) = await Run(new Claim("sub", "u1"), new Claim("pwd_change", "1"));
        Assert.Equal(StatusCodes.Status403Forbidden, status);
        Assert.False(reached);
    }

    [Fact]
    public async Task APasswordOfHisOwn_PassesThrough()
    {
        var (status, reached) = await Run(new Claim("sub", "u1"));
        Assert.Equal(StatusCodes.Status200OK, status);
        Assert.True(reached);
    }
}
