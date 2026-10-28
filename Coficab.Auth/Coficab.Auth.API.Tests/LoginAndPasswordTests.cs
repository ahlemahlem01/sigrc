using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Web;
using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Coficab.Auth.API.Tests;

/// <summary>Sign-in, session refresh and the forgotten-password flow.</summary>
public class LoginAndPasswordTests : IClassFixture<AuthApiFactory>
{
    private const string NewPassword = "An0ther!Pass-2";
    private readonly AuthApiFactory _factory;

    public LoginAndPasswordTests(AuthApiFactory factory) => _factory = factory;

    private async Task<(HttpClient Http, string Email, string RefreshToken)> SignedInAsync()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        var login = await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var body = await AuthApiFactory.Json(login);
        return (http, user.Email!, body.GetProperty("refresh_token").GetString()!);
    }

    private async Task<string> ResetTokenAsync(string email) =>
        await _factory.WithUsersAsync(async (users, _) => await users.GeneratePasswordResetTokenAsync((await users.FindByEmailAsync(email))!));

    private static object Reset(string email, string token, string password) => new { email, token, newPassword = password };

    // ---- 1. a session is re-checked when it is refreshed ---------------------------------------------------------------------------------

    [Fact]
    public async Task ARefreshWorksForAnOrdinarySession_AndHandsOutANewOne()
    {
        var (http, _, refresh) = await SignedInAsync();
        var renewed = await _factory.RefreshAsync(http, refresh);
        Assert.Equal(HttpStatusCode.OK, renewed.StatusCode);
        Assert.False(string.IsNullOrEmpty((await AuthApiFactory.Json(renewed)).GetProperty("access_token").GetString()));
    }

    [Fact]
    public async Task ASessionOpenedBeforeAPasswordReset_CanNoLongerBeRefreshed()
    {
        var (http, email, refresh) = await SignedInAsync();

        var reset = await http.PostAsJsonAsync("/api/password/reset", Reset(email, await ResetTokenAsync(email), NewPassword));
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        var refused = await _factory.RefreshAsync(http, refresh);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("invalid_grant", (await AuthApiFactory.Json(refused)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task ALockedAccountCannotRefresh_EvenWithAValidToken()
    {
        var (http, email, refresh) = await SignedInAsync();
        await _factory.WithUsersAsync(async (users, _) =>
        {
            var user = (await users.FindByEmailAsync(email))!;
            await users.SetLockoutEndDateAsync(user, DateTimeOffset.UtcNow.AddMinutes(15));
            return 0;
        });

        var refused = await _factory.RefreshAsync(http, refresh);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("account_locked", (await AuthApiFactory.Json(refused)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task AFailedSignInIsRecordedInTheAudit_AndTheMessageStaysTheSameForAnUnknownAccount()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();

        var wrong = await _factory.PasswordLoginAsync(http, user.Email!, "not-the-password");
        var unknown = await _factory.PasswordLoginAsync(http, $"nobody-{Guid.NewGuid():N}@coficab.test", "not-the-password");
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal(await unknown.Content.ReadAsStringAsync(), await wrong.Content.ReadAsStringAsync());          // nothing tells the two cases apart

        var recorded = await _factory.WithUsersAsync(async (_, db) => await db.AuditLogs.AnyAsync(a => a.Action == "LOGIN_FAILED" && a.TargetEmail == user.Email));
        Assert.True(recorded);
    }

    // ---- 2. "forgot password" does not reveal which accounts exist --------------------------------------------------------------------------

    [Fact]
    public async Task Forgot_AnswersTheSameWhetherTheAccountExistsOrNot_AndOnlyRealAccountsGetAMail()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        var stranger = $"nobody-{Guid.NewGuid():N}@coficab.test";

        var known = await http.PostAsJsonAsync("/api/password/forgot", new { email = user.Email });
        var unknown = await http.PostAsJsonAsync("/api/password/forgot", new { email = stranger });

        Assert.Equal(known.StatusCode, unknown.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        Assert.Single(await _factory.Mail.WaitAsync(user.Email!, "reset"));
        await Task.Delay(150);
        Assert.DoesNotContain(_factory.Mail.Mails, m => m.To == stranger);
    }

    [Fact]
    public async Task Forgot_StillAnswersOkWhenTheMailServerIsDown()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        _factory.Mail.Fail = true;
        try
        {
            var answer = await http.PostAsJsonAsync("/api/password/forgot", new { email = user.Email });
            Assert.Equal(HttpStatusCode.OK, answer.StatusCode);            // an error here would tell that the account exists
        }
        finally { _factory.Mail.Fail = false; }
    }

    [Fact]
    public async Task Forgot_TakesTheSameMinimumTimeForAnUnknownAccount()
    {
        var slow = _factory.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:ForgotMinimumMs"] = "250" })));
        var http = slow.CreateClient();
        var clock = Stopwatch.StartNew();
        var answer = await http.PostAsJsonAsync("/api/password/forgot", new { email = $"nobody-{Guid.NewGuid():N}@coficab.test" });
        Assert.Equal(HttpStatusCode.OK, answer.StatusCode);
        Assert.True(clock.ElapsedMilliseconds >= 230, $"answered in {clock.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task TheResetLink_EncodesTheAddressAndTheToken_AndWorksOnceFollowed()
    {
        var email = $"first.last+tag-{Guid.NewGuid():N}@coficab.test";            // a "+" is lost when it is not encoded
        await _factory.CreateUserAsync(email);
        var http = _factory.CreateClient();
        await http.PostAsJsonAsync("/api/password/forgot", new { email });

        var mail = Assert.Single(await _factory.Mail.WaitAsync(email, "reset"));
        var link = new Uri(mail.Link!);
        Assert.Equal("/reset-password", link.AbsolutePath);
        var query = HttpUtility.ParseQueryString(link.Query);
        Assert.Equal(email, query["email"]);

        var reset = await http.PostAsJsonAsync("/api/password/reset", Reset(query["email"]!, query["token"]!, NewPassword));
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _factory.PasswordLoginAsync(http, email, NewPassword)).StatusCode);
    }

    [Fact]
    public async Task TheMailTellsTheRealLifetimeOfTheLink()
    {
        var options = _factory.Services.GetRequiredService<IOptions<DataProtectionTokenProviderOptions>>().Value;
        Assert.Equal(TimeSpan.FromHours(1), options.TokenLifespan);                      // it was Identity's default of one day

        var user = await _factory.CreateUserAsync();
        await _factory.CreateClient().PostAsJsonAsync("/api/password/forgot", new { email = user.Email });
        Assert.Equal(60, Assert.Single(await _factory.Mail.WaitAsync(user.Email!, "reset")).Minutes);
    }

    [Fact]
    public async Task AMailboxCannotBeFlooded_OnlyThreeResetMailsPerAccountAndHour()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        for (var i = 0; i < 6; i++) Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/password/forgot", new { email = user.Email })).StatusCode);

        await _factory.Mail.WaitAsync(user.Email!, "reset", expected: 3);
        await Task.Delay(200);
        Assert.Equal(3, _factory.Mail.Mails.Count(m => m.To == user.Email && m.Kind == "reset"));
    }

    // ---- 3. rate limits ----------------------------------------------------------------------------------------------------------------------

    [Fact]
    public async Task TooManyRequestsFromOneAddress_AreRefusedWithARetryDelay()
    {
        var limited = _factory.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["RateLimiting:ForgotPerWindow"] = "2", ["RateLimiting:ResetPerWindow"] = "2", ["RateLimiting:TokenPerMinute"] = "3",
        })));
        var http = limited.CreateClient();

        for (var i = 0; i < 2; i++) Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/password/forgot", new { email = "x@coficab.test" })).StatusCode);
        var third = await http.PostAsJsonAsync("/api/password/forgot", new { email = "x@coficab.test" });
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.True(third.Headers.Contains("Retry-After"));

        for (var i = 0; i < 2; i++) await http.PostAsJsonAsync("/api/password/reset", Reset("x@coficab.test", "t", NewPassword));
        Assert.Equal(HttpStatusCode.TooManyRequests, (await http.PostAsJsonAsync("/api/password/reset", Reset("x@coficab.test", "t", NewPassword))).StatusCode);

        for (var i = 0; i < 3; i++) await _factory.PasswordLoginAsync(http, "x@coficab.test", "nope");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await _factory.PasswordLoginAsync(http, "x@coficab.test", "nope")).StatusCode);   // guessing passwords is slowed down too
    }

    // ---- 4. the reset itself ---------------------------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Reset_GivesTheSameAnswerForAnUnknownAccountAndAWrongToken()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();

        var unknown = await http.PostAsJsonAsync("/api/password/reset", Reset($"nobody-{Guid.NewGuid():N}@coficab.test", "whatever", NewPassword));
        var wrongToken = await http.PostAsJsonAsync("/api/password/reset", Reset(user.Email!, "whatever", NewPassword));

        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, wrongToken.StatusCode);
        Assert.Equal(await unknown.Content.ReadAsStringAsync(), await wrongToken.Content.ReadAsStringAsync());
        Assert.Equal("invalid_link", (await AuthApiFactory.Json(wrongToken)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Reset_ExplainsThePasswordRules_OnlyToTheHolderOfAValidToken_AndTheTokenSurvivesAWeakAttempt()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        var token = await ResetTokenAsync(user.Email!);

        var weak = await http.PostAsJsonAsync("/api/password/reset", Reset(user.Email!, token, "short"));
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        var body = await AuthApiFactory.Json(weak);
        Assert.Equal("weak_password", body.GetProperty("code").GetString());
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("message").GetString()));

        Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/password/reset", Reset(user.Email!, token, NewPassword))).StatusCode);   // same token, better password
    }

    [Fact]
    public async Task AResetLinkWorksOnlyOnce()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        var token = await ResetTokenAsync(user.Email!);

        Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/password/reset", Reset(user.Email!, token, NewPassword))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsJsonAsync("/api/password/reset", Reset(user.Email!, token, "Yet4nother!Pass-3"))).StatusCode);
    }

    [Fact]
    public async Task AfterAReset_TheNewPasswordWorks_TheOldOneDoesNot_TheLockoutIsLifted_AndTheOwnerIsToldByMail()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        await _factory.WithUsersAsync(async (users, _) =>
        {
            var u = (await users.FindByEmailAsync(user.Email!))!;
            await users.SetLockoutEndDateAsync(u, DateTimeOffset.UtcNow.AddMinutes(15));
            for (var i = 0; i < 3; i++) await users.AccessFailedAsync(u);
            return 0;
        });
        Assert.NotEqual(HttpStatusCode.OK, (await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword)).StatusCode);   // locked out

        Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/password/reset", Reset(user.Email!, await ResetTokenAsync(user.Email!), NewPassword))).StatusCode);

        Assert.Equal(0, await _factory.WithUsersAsync(async (users, _) => await users.GetAccessFailedCountAsync((await users.FindByEmailAsync(user.Email!))!)));   // the failed attempts are forgotten
        Assert.Equal(HttpStatusCode.OK, (await _factory.PasswordLoginAsync(http, user.Email!, NewPassword)).StatusCode);                        // unlocked, new password
        Assert.NotEqual(HttpStatusCode.OK, (await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword)).StatusCode);   // the old one is gone
        Assert.Single(await _factory.Mail.WaitAsync(user.Email!, "changed"));
        Assert.True(await _factory.WithUsersAsync(async (_, db) => await db.AuditLogs.AnyAsync(a => a.Action == "PASSWORD_RESET" && a.TargetEmail == user.Email)));
    }
}
