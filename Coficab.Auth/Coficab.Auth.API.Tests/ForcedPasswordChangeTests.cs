using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Coficab.Auth.API.Tests;

/// <summary>Status "reinitialized": a temporary password must be changed; after that the account is back to normal.</summary>
public class ForcedPasswordChangeTests : IClassFixture<AuthApiFactory>
{
    private const string NewPassword = "Chosen!Pass-77";
    private readonly AuthApiFactory _factory;

    public ForcedPasswordChangeTests(AuthApiFactory factory) => _factory = factory;

    [Fact]
    public async Task ATemporaryPassword_IsFlagged_AndChangingItClearsTheFlag()
    {
        var user = await _factory.CreateUserAsync();
        await _factory.WithUsersAsync(async (users, _) =>
        {
            var u = (await users.FindByEmailAsync(user.Email!))!;
            u.MustChangePassword = true;
            await users.UpdateAsync(u);
            return 0;
        });

        var http = _factory.CreateClient();
        var login = await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await AuthApiFactory.Json(login)).GetProperty("access_token").GetString());

        Assert.True((await AuthApiFactory.Json(await http.GetAsync("/api/me"))).GetProperty("mustChangePassword").GetBoolean());

        var wrong = await http.PostAsJsonAsync("/api/password/change", new { currentPassword = "Not-the-password-1!", newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        var same = await http.PostAsJsonAsync("/api/password/change", new { currentPassword = AuthApiFactory.StrongPassword, newPassword = AuthApiFactory.StrongPassword });
        Assert.Equal(HttpStatusCode.BadRequest, same.StatusCode);
        var weak = await http.PostAsJsonAsync("/api/password/change", new { currentPassword = AuthApiFactory.StrongPassword, newPassword = "abcdefgh1" });   // no special character
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);

        var changed = await http.PostAsJsonAsync("/api/password/change", new { currentPassword = AuthApiFactory.StrongPassword, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        var relogin = await _factory.PasswordLoginAsync(_factory.CreateClient(), user.Email!, NewPassword);
        Assert.Equal(HttpStatusCode.OK, relogin.StatusCode);
        var fresh = _factory.CreateClient();
        fresh.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await AuthApiFactory.Json(relogin)).GetProperty("access_token").GetString());
        Assert.False((await AuthApiFactory.Json(await fresh.GetAsync("/api/me"))).GetProperty("mustChangePassword").GetBoolean());
    }

    [Fact]
    public async Task ChangingThePassword_NeedsASession()
    {
        var anonymous = _factory.CreateClient();
        var response = await anonymous.PostAsJsonAsync("/api/password/change", new { currentPassword = "x", newPassword = "y" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
