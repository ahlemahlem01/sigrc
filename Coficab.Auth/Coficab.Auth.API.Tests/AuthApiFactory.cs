using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Coficab.Auth.API.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using OpenIddict.Abstractions;

namespace Coficab.Auth.API.Tests;

/// <summary>An e-mail service that keeps what it would have sent (and can be told to fail), so the flows can be checked without a mail server.</summary>
public sealed class RecordingEmailService : EmailService
{
    public sealed record Sent(string Kind, string To, string? Link = null, int? Minutes = null);

    public ConcurrentQueue<Sent> Mails { get; } = new();
    public volatile bool Fail;

    public RecordingEmailService() : base(new ConfigurationBuilder().Build()) { }

    private Task Record(Sent mail)
    {
        if (Fail) throw new InvalidOperationException("the mail server is down");
        Mails.Enqueue(mail);
        return Task.CompletedTask;
    }

    public override Task SendResetPasswordEmailAsync(string toEmail, string resetLink, int validMinutes = 60) => Record(new("reset", toEmail, resetLink, validMinutes));
    public override Task SendPasswordChangedEmailAsync(string toEmail, string fullName) => Record(new("changed", toEmail));
    public override Task SendLockoutEmailAsync(string toEmail, string fullName, DateTimeOffset lockoutEnd) => Record(new("lockout", toEmail));
    public override Task SendWelcomeEmailAsync(string toEmail, string fullName, string temporaryPassword) => Record(new("welcome", toEmail));

    /// <summary>Mails are sent in the background: waits (briefly) until the expected number was recorded for an address.</summary>
    public async Task<List<Sent>> WaitAsync(string to, string kind, int expected = 1, int timeoutMs = 3000)
    {
        var until = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < until)
        {
            var found = Mails.Where(m => m.To == to && m.Kind == kind).ToList();
            if (found.Count >= expected) return found;
            await Task.Delay(25);
        }
        return Mails.Where(m => m.To == to && m.Kind == kind).ToList();
    }
}

public sealed class AuthApiFactory : WebApplicationFactory<AuthApiMarker>
{
    public const string ClientId = "test-client";
    public const string StrongPassword = "Str0ng!Pass-1";

    private static readonly SemaphoreSlim Gate = new(1, 1);
    private readonly string _dbName = $"AuthTests_{Guid.NewGuid():N}";
    private volatile bool _ready;

    public RecordingEmailService Mail { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Provider"] = "InMemory",
                ["Database:Name"] = _dbName,
                ["Frontend:Url"] = "http://front.test",
                ["Auth:ForgotMinimumMs"] = "0",
                ["Auth:PasswordResetLifetimeMinutes"] = "60",
                ["RateLimiting:ForgotPerWindow"] = "1000",
                ["RateLimiting:ResetPerWindow"] = "1000",
                ["RateLimiting:TokenPerMinute"] = "1000",
            });
        });
        builder.ConfigureTestServices(services =>
        {
            foreach (var d in services.Where(d => d.ServiceType == typeof(IHostedService)).ToList()) services.Remove(d);   // no seeding, no migration
            services.RemoveAll<EmailService>();
            services.AddScoped<EmailService>(_ => Mail);
        });
    }

    /// <summary>Registers the browser client once (the application seeds it at start-up; the tests start without the seeding).</summary>
    public async Task ReadyAsync()
    {
        if (_ready) return;
        await Gate.WaitAsync();
        try
        {
            if (_ready) return;
            using var scope = Services.CreateScope();
            var apps = scope.ServiceProvider.GetRequiredService<IOpenIddictApplicationManager>();
            if (await apps.FindByClientIdAsync(ClientId) == null)
            {
                var client = new OpenIddictApplicationDescriptor { ClientId = ClientId, ClientType = OpenIddictConstants.ClientTypes.Public, DisplayName = "Tests" };
                client.Permissions.UnionWith(new[]
                {
                    OpenIddictConstants.Permissions.Endpoints.Token,
                    OpenIddictConstants.Permissions.GrantTypes.Password,
                    OpenIddictConstants.Permissions.GrantTypes.RefreshToken,
                    OpenIddictConstants.Permissions.Scopes.Email,
                    OpenIddictConstants.Permissions.Scopes.Profile,
                    OpenIddictConstants.Permissions.Scopes.Roles,
                    "scp:openid", "scp:offline_access", "scp:action-plan-api",
                });
                await apps.CreateAsync(client);
            }
            _ready = true;
        }
        finally { Gate.Release(); }
    }

    public async Task<ApplicationUser> CreateUserAsync(string? email = null, string password = StrongPassword)
    {
        await ReadyAsync();
        email ??= $"user-{Guid.NewGuid():N}@coficab.test";
        using var scope = Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser { UserName = email, Email = email, FullName = "Utilisateur Test", Department = "QA" };
        var created = await users.CreateAsync(user, password);
        Assert.True(created.Succeeded, string.Join("; ", created.Errors.Select(e => e.Description)));
        return user;
    }

    /// <summary>Runs something with the user manager (set a lockout, read the account, make a reset token...).</summary>
    public async Task<T> WithUsersAsync<T>(Func<UserManager<ApplicationUser>, AppDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(), scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public async Task<HttpResponseMessage> PasswordLoginAsync(HttpClient http, string email, string password) =>
        await http.PostAsync("/connect/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "password", ["client_id"] = ClientId, ["username"] = email, ["password"] = password, ["scope"] = "openid offline_access",
        }));

    public async Task<HttpResponseMessage> RefreshAsync(HttpClient http, string refreshToken) =>
        await http.PostAsync("/connect/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token", ["client_id"] = ClientId, ["refresh_token"] = refreshToken,
        }));

    public static async Task<JsonElement> Json(HttpResponseMessage response) => await response.Content.ReadFromJsonAsync<JsonElement>();
}
