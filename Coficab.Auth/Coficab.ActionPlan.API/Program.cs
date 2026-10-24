using Coficab.ActionPlan.API.Hubs;
using Coficab.ActionPlan.API.Logging;
using Coficab.ActionPlan.Application;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;
using Coficab.ActionPlan.Infrastructure;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.ActionPlan.Infrastructure.Repositories;
using Coficab.ActionPlan.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Validation.AspNetCore;
using System.Net.Http;
using System.Security.Claims;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
builder.AddCoficabSerilog("coficab-actionplan");

// Primary SQL Server connection comes from User Secrets (ConnectionStrings:DefaultConnection).
// Tests use the in-memory provider and do not need this value.
if (!builder.Environment.IsEnvironment("Testing"))
{
    var defaultConnection = builder.Configuration.GetConnectionString("DefaultConnection");
    if (string.IsNullOrWhiteSpace(defaultConnection))
        throw new InvalidOperationException(
            "ConnectionStrings:DefaultConnection is missing. Set it with: dotnet user-secrets set \"ConnectionStrings:DefaultConnection\" \"<SQL Server connection string>\"");

    if (string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("ActionPlanDb")))
        builder.Configuration["ConnectionStrings:ActionPlanDb"] = defaultConnection;
}

// ✅ Infrastructure et Application
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddApplication();

builder.Services.AddHttpClient();
builder.Services.AddHttpClient("AuthApi")
    .ConfigurePrimaryHttpMessageHandler(() =>
    {
        var handler = new HttpClientHandler();
        if (builder.Environment.IsDevelopment())
        {
            handler.ServerCertificateCustomValidationCallback =
                HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
        }
        return handler;
    });
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUserProfileService, UserProfileService>();
builder.Services.AddScoped<IBadgeService, BadgeService>();
builder.Services.AddScoped<IDocumentService, DocumentService>();
builder.Services.AddScoped<ITimelineService, TimelineService>();
builder.Services.AddScoped<IEmployeeActivityService, EmployeeActivityService>();
builder.Services.AddHostedService<Coficab.ActionPlan.API.Services.DatabaseMigrationHostedService>();
builder.Services.AddHostedService<Coficab.ActionPlan.API.Services.ProductionReferenceDataInitializer>();
builder.Services.AddHostedService<Coficab.ActionPlan.API.Services.EmployeeActivityHostedService>();
builder.Services.AddHostedService<Coficab.ActionPlan.API.Services.ReportScheduleHostedService>();
// Anomaly detection is event-driven (ClaimCreated/ClaimClosed → MediatR handlers).
// Keep DetectAndPersistAsync for manual reconciliation if needed.
builder.Services.AddHostedService<Coficab.ActionPlan.API.Services.SemanticEmbeddingHostedService>();
builder.Services.AddScoped<IApplicationDbContext>(provider =>
    provider.GetRequiredService<ActionPlanDbContext>());

// ✅ Services
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserService, UserService>();

// ✅ SignalR
builder.Services.AddSignalR();
builder.Services.AddScoped<IParetoService, ParetoService>();
builder.Services.AddScoped<Coficab.ActionPlan.Application.Kpi.IClaimKpiReader, Coficab.ActionPlan.Infrastructure.Reads.ClaimKpiReader>();
// ✅ OpenIddict validation with Development SSL Bypass
builder.Services.AddOpenIddict()
    .AddValidation(options =>
    {
        // Must equal the Auth API issuer exactly (Auth:Issuer, same value on both APIs).
        options.SetIssuer(builder.Configuration["Auth:Issuer"] ?? "https://localhost:7102/");
        options.AddAudiences("coficab-action-plan-api");

        options.UseSystemNetHttp(httpOptions =>
        {
            httpOptions.ConfigureHttpClientHandler(handler =>
            {
                if (builder.Environment.IsDevelopment())
                {
                    handler.ServerCertificateCustomValidationCallback =
                        HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
                }
            });
        });

        options.UseAspNetCore();
    });

// ✅ Définir le scheme par défaut
builder.Services.AddAuthentication(OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme);

// ✅ Authorization
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireAssertion(context =>
        {
            var roles = context.User.FindAll("role")
                .Concat(context.User.FindAll(System.Security.Claims.ClaimTypes.Role))
                .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
                .Where(v => v.Length > 0)
                .ToHashSet();

            return roles.Contains("admin")
                || roles.Contains("superadmin")
                || roles.Contains("admin_quality");
        }));
});

// ✅ CORS — SignalR requires AllowCredentials
// Cors:AllowedOrigins: array, or one comma-separated value (e.g. an environment variable).
var allowedOrigins = ReadAllowedOrigins(builder.Configuration);
builder.Services.AddCors(options =>
{
    options.AddPolicy("CoficabFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("X-Correlation-Id", "X-Total-Count", "X-Page", "X-Page-Size")
              .AllowCredentials();
    });
});

// ✅ Controllers & String Enum Serializer
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Coficab ActionPlan API", Version = "v1" });
    c.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());
    c.AddSecurityDefinition("Bearer", new()
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Enter: Bearer {your token}"
    });
    c.AddSecurityRequirement(new()
    {
        {
            new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddScoped<IGenericRepository<ActionPlanHistory>, GenericRepository<ActionPlanHistory>>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<Coficab.ActionPlan.API.Services.D4ChainService>();
builder.Services.AddSingleton<Coficab.ActionPlan.API.Services.LatencyMetrics>();
builder.Services.AddScoped<INotificationBroadcaster, NotificationBroadcaster>();

var app = builder.Build();

// Tables are created by EF migrations (dotnet ef database update), never by raw SQL at startup.
// Embeddings are stored as JSON text and ranked in memory.

if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseDeveloperExceptionPage();
}

// 📸 Activation de l'accès aux fichiers statiques (images, avatars dans wwwroot)
app.UseStaticFiles();

// ✅ SignalR WebSocket token injection
app.Use(async (context, next) =>
{
    var accessToken = context.Request.Query["access_token"];
    if (!string.IsNullOrEmpty(accessToken) &&
        context.Request.Path.StartsWithSegments("/hubs"))
    {
        context.Request.Headers["Authorization"] = "Bearer " + accessToken;
    }
    await next();
});

app.UseCoficabRequestLogging();
app.UseMiddleware<Coficab.ActionPlan.API.Services.LatencyMiddleware>();

// ✅ Native CORS Policy (Handles preflight OPTIONS automatically)
app.UseCors("CoficabFrontend");

app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<Coficab.ActionPlan.API.Services.ValidationExceptionMiddleware>();

// ✅ SignalR hub
app.MapHub<NotificationHub>("/hubs/notifications");

app.MapControllers();

// Liveness: no database call, so a sleeping database does not make the container look dead.
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
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

/// <summary>Expose entry point for WebApplicationFactory integration tests.</summary>
public partial class Program { }