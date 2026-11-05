using System.Net;
using System.Net.Http.Json;
using Coficab.Auth.API.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Coficab.Auth.API.Tests;

/// <summary>Cloudflare Turnstile on the sign-in and forgot-password forms: off unless a secret is configured, checked before the account.</summary>
public class TurnstileTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public TurnstileTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient ClientWithTurnstile(string? secret = "test-secret", string? siteKey = "site-key-123", bool failOpen = false) =>
        _factory.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Turnstile:SecretKey"] = secret, ["Turnstile:SiteKey"] = siteKey, ["Turnstile:FailOpen"] = failOpen.ToString(),
            ["Turnstile:TestVerdict"] = "unused",
        }))).CreateClient();

    // ---- the pages learn whether to show the widget -------------------------------------------------------------------------------------

    [Fact]
    public async Task ThePagesAreTold_WhetherTheWidgetIsOn_AndWithWhichPublicKey_NeverTheSecret()
    {
        var off = await _factory.CreateClient().GetFromJsonAsync<System.Text.Json.JsonElement>("/api/public/turnstile");
        Assert.False(off.GetProperty("enabled").GetBoolean());

        var on = await ClientWithTurnstile().GetAsync("/api/public/turnstile");
        var text = await on.Content.ReadAsStringAsync();
        Assert.Contains("\"enabled\":true", text);
        Assert.Contains("site-key-123", text);
        Assert.DoesNotContain("test-secret", text);
    }

    [Fact]
    public async Task WithoutASecret_NothingIsAsked_SignInWorksAsBefore()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/password/forgot", new { email = user.Email })).StatusCode);
    }

    // ---- the check, with a verifier that answers instead of Cloudflare -------------------------------------------------------------------

    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> reply) : HttpMessageHandler
    {
        public List<string> Bodies { get; } = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Bodies.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct));
            return await reply(request);
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static TurnstileVerifier Verifier(Handler handler, string? secret = "test-secret", bool failOpen = false) =>
        new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Turnstile:SecretKey"] = secret, ["Turnstile:FailOpen"] = failOpen.ToString() }).Build(),
            new Factory(handler), NullLogger<TurnstileVerifier>.Instance);

    private static Handler Answers(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(_ => Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(json) }));

    [Fact]
    public async Task TheVerifierSendsTheSecretTheTokenAndTheAddress_AndTrustsOnlyWhatCloudflareConfirms()
    {
        var handler = Answers("{\"success\":true}");
        Assert.True(await Verifier(handler).VerifyAsync("the-token", "203.0.113.7"));
        var sent = Assert.Single(handler.Bodies);
        Assert.Contains("secret=test-secret", sent);
        Assert.Contains("response=the-token", sent);
        Assert.Contains("remoteip=203.0.113.7", sent);

        Assert.False(await Verifier(Answers("{\"success\":false,\"error-codes\":[\"invalid-input-response\"]}")).VerifyAsync("bad", null));
        Assert.False(await Verifier(Answers("not json")).VerifyAsync("bad", null));
    }

    [Fact]
    public async Task AMissingOrOversizedTokenIsRefusedWithoutAskingCloudflare()
    {
        var handler = Answers("{\"success\":true}");
        var verifier = Verifier(handler);
        Assert.False(await verifier.VerifyAsync(null, null));
        Assert.False(await verifier.VerifyAsync("  ", null));
        Assert.False(await verifier.VerifyAsync(new string('x', 2049), null));
        Assert.Empty(handler.Bodies);
    }

    [Fact]
    public async Task WhenCloudflareCannotBeReached_TheCheckFails_UnlessTheSiteChoseToFailOpen()
    {
        static Handler Down() => new(_ => throw new HttpRequestException("no route to host"));
        Assert.False(await Verifier(Down()).VerifyAsync("t", null));
        Assert.False(await Verifier(Answers("{}", HttpStatusCode.BadGateway)).VerifyAsync("t", null));
        Assert.True(await Verifier(Down(), failOpen: true).VerifyAsync("t", null));
        Assert.True(await Verifier(Down(), secret: null).VerifyAsync(null, null));          // switched off: always fine
    }

    // ---- on the forms ----------------------------------------------------------------------------------------------------------------------

    [Fact]
    public async Task SignInWithoutAToken_IsRefusedBeforeTheAccountIsLookedAt_AndAuditedWithoutCountingAFailedAttempt()
    {
        var user = await _factory.CreateUserAsync();
        var http = ClientWithTurnstile();          // the real verifier: no token = refused without any call to Cloudflare

        var refused = await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("captcha_failed", (await AuthApiFactory.Json(refused)).GetProperty("error").GetString());

        // the right password was not even tried: no failed attempt, and the refusal is in the audit
        Assert.Equal(0, await _factory.WithUsersAsync(async (users, _) => await users.GetAccessFailedCountAsync((await users.FindByEmailAsync(user.Email!))!)));
        Assert.True(await _factory.WithUsersAsync(async (_, db) => await db.AuditLogs.AnyAsync(a => a.Action == "CAPTCHA_FAILED" && a.TargetEmail == user.Email)));
    }

    [Fact]
    public async Task ForgotPasswordWithoutAToken_IsRefused_AndNoMailIsSent()
    {
        var user = await _factory.CreateUserAsync();
        var http = ClientWithTurnstile();

        var refused = await http.PostAsJsonAsync("/api/password/forgot", new { email = user.Email });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("captcha_failed", (await AuthApiFactory.Json(refused)).GetProperty("code").GetString());

        var unknown = await http.PostAsJsonAsync("/api/password/forgot", new { email = $"nobody-{Guid.NewGuid():N}@coficab.test" });
        Assert.Equal(await refused.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());        // the refusal says nothing about the account
        await Task.Delay(200);
        Assert.DoesNotContain(_factory.Mail.Mails, m => m.To == user.Email);
    }

    [Fact]
    public async Task ARefreshNeedsNoToken_ItCarriesNoPassword()
    {
        var user = await _factory.CreateUserAsync();
        var http = _factory.CreateClient();
        var refresh = (await AuthApiFactory.Json(await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword))).GetProperty("refresh_token").GetString()!;

        // the check is switched on for this same host (other hosts sign their tokens with other keys)
        var settings = (IConfigurationRoot)_factory.Services.GetRequiredService<IConfiguration>();
        settings["Turnstile:SecretKey"] = "test-secret";
        try
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword)).StatusCode);   // a new sign-in is checked...
            Assert.Equal(HttpStatusCode.OK, (await _factory.RefreshAsync(http, refresh)).StatusCode);                                                   // ...a refresh is not
        }
        finally { settings["Turnstile:SecretKey"] = null; }
    }
}
