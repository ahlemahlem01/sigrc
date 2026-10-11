using System.Security.Claims;
using Serilog;
using Serilog.Context;
using Serilog.Events;

namespace Coficab.Auth.API.Logging;

/// <summary>
/// Structured logging (Serilog): console + a daily rolling file, a correlation id per request and one line per
/// HTTP request with its duration. Requests slower than <see cref="SlowRequestMs"/> are logged as warnings.
/// </summary>
public static class SerilogSetup
{
    /// <summary>Target of the specification: responses under 300 ms.</summary>
    public const int SlowRequestMs = 300;

    public static void AddCoficabSerilog(this WebApplicationBuilder builder, string appName)
    {
        builder.Host.UseSerilog((context, services, configuration) =>
        {
            configuration
                .MinimumLevel.Information()
                // Framework noise (including every SQL command) is kept out unless a problem occurs.
                .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
                .MinimumLevel.Override("Microsoft.AspNetCore.Hosting.Diagnostics", LogEventLevel.Warning)
                .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
                .MinimumLevel.Override("System", LogEventLevel.Warning)
                .ReadFrom.Configuration(context.Configuration) // appsettings "Serilog" section can override the above
                .Enrich.FromLogContext()
                .Enrich.WithProperty("Application", appName)
                .WriteTo.Console(outputTemplate:
                    "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {CorrelationId}{NewLine}{Exception}");

            if (!context.HostingEnvironment.IsEnvironment("Testing"))
            {
                configuration.WriteTo.File(
                    path: Path.Combine("logs", $"{appName}-.log"),
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 14,
                    outputTemplate:
                        "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level:u3}] {CorrelationId} {UserId} {Message:lj}{NewLine}{Exception}");
            }
        });
    }

    /// <summary>Correlation id first (so every log line of the request carries it), then the request line.</summary>
    public static void UseCoficabRequestLogging(this WebApplication app)
    {
        app.Use(async (http, next) =>
        {
            var incoming = http.Request.Headers["X-Correlation-Id"].FirstOrDefault();
            var id = !string.IsNullOrWhiteSpace(incoming) && incoming.Length <= 64 && incoming.All(c => char.IsLetterOrDigit(c) || c == '-')
                ? incoming
                : Guid.NewGuid().ToString("N")[..12];
            http.Response.Headers["X-Correlation-Id"] = id;
            using (LogContext.PushProperty("CorrelationId", id))
                await next();
        });

        app.UseSerilogRequestLogging(options =>
        {
            options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} -> {StatusCode} in {Elapsed:0} ms";
            options.GetLevel = (http, elapsedMs, exception) =>
                exception != null || http.Response.StatusCode >= 500 ? LogEventLevel.Error
                : elapsedMs > SlowRequestMs ? LogEventLevel.Warning
                : http.Request.Path.StartsWithSegments("/hubs") ? LogEventLevel.Debug
                : LogEventLevel.Information;
            options.EnrichDiagnosticContext = (diagnostics, http) =>
                diagnostics.Set("UserId", http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub") ?? "-");
        });
    }
}
