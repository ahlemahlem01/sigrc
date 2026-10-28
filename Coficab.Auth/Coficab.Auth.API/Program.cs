using Coficab.Auth.API.Data;
using Coficab.Auth.API.Logging;
using Coficab.Auth.API.Models;
using Coficab.Auth.API.Services;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;
using OpenIddict.Abstractions;
using OpenIddict.Server.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddCoficabSerilog("coficab-auth");

// ─── Database (User Secrets in Development: ConnectionStrings:DefaultConnection)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
// The "Testing" environment (automated tests) uses an in-memory database selected by "Database:Provider": "InMemory"
if (!builder.Environment.IsEnvironment("Testing") && string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection is missing. Set it with: dotnet user-secrets set \"ConnectionStrings:DefaultConnection\" \"<SQL Server connection string>\"");

builder.Services.AddDbContext<AppDbContext>((services, options) =>
{
    var settings = services.GetRequiredService<IConfiguration>();
    if (string.Equals(settings["Database:Provider"], "InMemory", StringComparison.OrdinalIgnoreCase))
        options.UseInMemoryDatabase(settings["Database:Name"] ?? "AuthTests");
    else
        options.UseSqlServer(Coficab.Auth.API.Data.SqlConnectionResilience.WithDefaults(connectionString!), sql =>
        {
            sql.MigrationsHistoryTable("__EFMigrationsHistory", "app_auth");
            sql.CommandTimeout(60);
        });
    options.UseOpenIddict();
});

// ─── Services ────────────────────────────────────────────────
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<AuditService>();

// ─── ASP.NET Core Identity ───────────────────────────────────
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
{
    // Password
    options.Password.RequiredLength = 8;
    options.Password.RequireNonAlphanumeric = false;

    // Lockout — explicit so behaviour is clear and easy to tune
    options.Lockout.AllowedForNewUsers = true;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
})
.AddEntityFrameworkStores<AppDbContext>()
.AddDefaultTokenProviders();

// A reset link lives as long as the e-mail says (it used to be Identity's default of one day while the mail promised one hour).
builder.Services.Configure<DataProtectionTokenProviderOptions>(o =>
    o.TokenLifespan = TimeSpan.FromMinutes(Math.Max(5, builder.Configuration.GetValue("Auth:PasswordResetLifetimeMinutes", 60))));

builder.Services.AddMemoryCache();

// ─── Rate limits (per client address). Behind the Docker network every visitor shares an address, so the figures are generous:
// they stop a script, not a person. Tunable with RateLimiting:*.
builder.Services.AddRateLimiter(limiter =>
{
    limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    limiter.OnRejected = (context, _) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
            context.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retry.TotalSeconds)).ToString();
        return ValueTask.CompletedTask;
    };
    void PerAddress(string policy, string key, int permits, TimeSpan window) =>
        limiter.AddPolicy(policy, http => RateLimitPartition.GetFixedWindowLimiter(
            http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue(key, permits),
                Window = window,
                QueueLimit = 0,
            }));
    PerAddress("forgot", "RateLimiting:ForgotPerWindow", 10, TimeSpan.FromMinutes(15));
    PerAddress("reset", "RateLimiting:ResetPerWindow", 20, TimeSpan.FromMinutes(15));
    PerAddress("token", "RateLimiting:TokenPerMinute", 60, TimeSpan.FromMinutes(1));
});

// ─── OpenIddict ──────────────────────────────────────────────
var usingEphemeralKeys = false;
builder.Services.AddOpenIddict()
    .AddCore(options =>
    {
        options.UseEntityFrameworkCore().UseDbContext<AppDbContext>();
    })
    .AddServer(options =>
    {
        options.SetTokenEndpointUris("/connect/token");
        options.SetAuthorizationEndpointUris("/connect/authorize");
        options.SetUserInfoEndpointUris("/connect/userinfo");

        options.AllowPasswordFlow();
        options.AllowRefreshTokenFlow();
        options.AllowAuthorizationCodeFlow();
        options.AllowClientCredentialsFlow();
        options.SetIntrospectionEndpointUris("/connect/introspect");

        options.RegisterScopes(
            OpenIddictConstants.Scopes.OpenId,
            OpenIddictConstants.Scopes.Email,
            OpenIddictConstants.Scopes.Profile,
            OpenIddictConstants.Scopes.Roles,
            OpenIddictConstants.Scopes.OfflineAccess,
            "action-plan-api"
        );

        // Public issuer URL (Auth:Issuer). Behind a TLS-terminating proxy (Caddy, a cloud load balancer) the
        // request scheme is http, so deployments must set it; locally it is inferred.
        var issuer = builder.Configuration["Auth:Issuer"];
        if (!string.IsNullOrWhiteSpace(issuer))
            options.SetIssuer(new Uri(issuer));

        options.DisableAccessTokenEncryption();

        // Keys: PFX certificates from configuration, else development certificates locally,
        // else ephemeral keys (tokens stop validating on every restart — set the certificates).
        var signingCertificate = LoadCertificate(builder.Configuration, "Auth:SigningCertificate");
        var encryptionCertificate = LoadCertificate(builder.Configuration, "Auth:EncryptionCertificate");
        if (signingCertificate != null && encryptionCertificate != null)
        {
            options.AddSigningCertificate(signingCertificate);
            options.AddEncryptionCertificate(encryptionCertificate);
        }
        else if (builder.Environment.IsDevelopment())
        {
            options.AddDevelopmentEncryptionCertificate();
            options.AddDevelopmentSigningCertificate();
        }
        else
        {
            usingEphemeralKeys = true;
            options.AddEphemeralEncryptionKey();
            options.AddEphemeralSigningKey();
        }

        options.UseAspNetCore()
            .EnableTokenEndpointPassthrough()
            .EnableAuthorizationEndpointPassthrough()
            .EnableUserInfoEndpointPassthrough()
            .DisableTransportSecurityRequirement();

        options.RegisterClaims(OpenIddictConstants.Claims.Role, "department", "permission");
    })
    .AddValidation(options =>
    {
        options.UseLocalServer();
        options.UseAspNetCore();
    });

// ─── CORS ────────────────────────────────────────────────────
// Cors:AllowedOrigins: array, or one comma-separated value (e.g. an environment variable).
var allowedOrigins = ReadAllowedOrigins(builder.Configuration);
builder.Services.AddCors(options =>
{
    options.AddPolicy("CoficabFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("X-Correlation-Id")
              .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.DocInclusionPredicate((docName, apiDesc) =>
        !apiDesc.RelativePath!.StartsWith("connect/"));
    c.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());
});
builder.Services.AddSingleton<SeedState>();
builder.Services.AddHostedService<SeedWorker>();

// ─── Pipeline ────────────────────────────────────────────────
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (usingEphemeralKeys)
    app.Logger.LogWarning(
        "No Auth:SigningCertificate / Auth:EncryptionCertificate configured: using ephemeral keys. " +
        "Every restart invalidates issued tokens.");

app.Use(async (context, next) =>
{
    var origin = context.Request.Headers.Origin.ToString();
    if (context.Request.Path.StartsWithSegments("/connect")
        && allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
    {
        context.Response.Headers.Append("Access-Control-Allow-Origin", origin);
        context.Response.Headers.Append("Vary", "Origin");
        context.Response.Headers.Append("Access-Control-Allow-Headers", "Authorization, Content-Type");
        context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        context.Response.Headers.Append("Access-Control-Allow-Credentials", "true");

        if (context.Request.Method == "OPTIONS")
        {
            context.Response.StatusCode = 204;
            return;
        }
    }
    await next();
});

app.UseRouting();
app.UseRateLimiter();
app.UseCoficabRequestLogging();
app.UseCors("CoficabFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers().RequireCors("CoficabFrontend");

// Liveness: answers as long as the process runs, without touching the database (a sleeping database must not look like a crash).
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
// Readiness: reports whether the startup migration + seed finished; 503 while the database is still waking up.
app.MapGet("/health/ready", (SeedState seed) => seed.Ready
    ? Results.Ok(new { status = "ready" })
    : Results.Json(new { status = "starting", detail = seed.LastError ?? "waiting for the database" }, statusCode: 503)).AllowAnonymous();
app.Run();

static string[] ReadAllowedOrigins(IConfiguration configuration)
{
    var section = configuration.GetSection("Cors:AllowedOrigins");
    var origins = (section.Value ?? string.Empty)
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Concat(section.GetChildren().Select(c => c.Value?.Trim() ?? string.Empty))
        .Where(o => o.Length > 0)
        .Select(o => o.TrimEnd('/'))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();
    return origins.Length > 0 ? origins : new[] { "http://localhost:3000" };
}

// {key}:Base64 holds a PFX file encoded in base64, {key}:Password its password (optional).
static X509Certificate2? LoadCertificate(IConfiguration configuration, string key)
{
    var base64 = configuration[$"{key}:Base64"];
    if (string.IsNullOrWhiteSpace(base64))
        return null;

    return X509CertificateLoader.LoadPkcs12(
        Convert.FromBase64String(base64),
        configuration[$"{key}:Password"],
        X509KeyStorageFlags.EphemeralKeySet);
}

/// <summary>Anchors the integration tests to this assembly (the top-level Program type stays internal: the Action Plan API has its own).</summary>
public sealed class AuthApiMarker { }
