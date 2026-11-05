using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Notifications;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Sends each person a digest of what waits for them (late actions, actions due this week, late claims) at the day and hour the
/// local administrator chose (Settings > Notifications). Nothing is sent when the digest is off or when the person has nothing waiting.
/// </summary>
public class NotificationDigestHostedService : BackgroundService
{
    public const string ModeKey = "notif.digest.mode";
    public const string HourKey = "notif.digest.hour";
    public const string DayKey = "notif.digest.day";
    public const string MaskKey = "notif.digest.daysMask";
    public const string LastRunKey = "notif.digest.lastRunUnix";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<NotificationDigestHostedService> _logger;

    public NotificationDigestHostedService(IServiceScopeFactory scopeFactory, IConfiguration config, ILogger<NotificationDigestHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    public static DigestSchedule Read(IReadOnlyDictionary<string, double> values)
    {
        double V(string key, double fallback) => values.TryGetValue(key, out var v) ? v : fallback;
        return new DigestSchedule((DigestMode)(int)V(ModeKey, 0), (int)V(HourKey, 8), (int)V(DayKey, 1), (int)V(MaskKey, DigestSchedule.Default.DaysMask));
    }

    private TimeZoneInfo Zone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(_config["Notifications:TimeZone"] ?? "Africa/Tunis"); }
        catch { return TimeZoneInfo.Utc; }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(50), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                await RunIfDueAsync(scope.ServiceProvider, DateTime.UtcNow, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Échec du résumé de notifications");
            }

            try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>Runs the digest when the schedule says it is due; returns how many people were notified (0 when not due).</summary>
    public async Task<int> RunIfDueAsync(IServiceProvider services, DateTime nowUtc, CancellationToken ct)
    {
        var db = services.GetRequiredService<ActionPlanDbContext>();
        var settings = await db.OverviewSettings.Where(s => s.Key.StartsWith("notif.digest.")).ToListAsync(ct);
        var values = settings.ToDictionary(s => s.Key, s => s.Value);
        var schedule = Read(values);

        var zone = Zone();
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, zone);
        DateTime? lastLocal = values.TryGetValue(LastRunKey, out var unix) && unix > 0
            ? TimeZoneInfo.ConvertTimeFromUtc(DateTimeOffset.FromUnixTimeSeconds((long)unix).UtcDateTime, zone)
            : null;
        if (!schedule.IsDue(nowLocal, lastLocal)) return 0;

        var sent = await SendDigestAsync(db, services.GetRequiredService<INotificationService>(), nowUtc, ct);

        var last = settings.FirstOrDefault(s => s.Key == LastRunKey);
        var stamp = new DateTimeOffset(nowUtc).ToUnixTimeSeconds();
        if (last == null) db.OverviewSettings.Add(new OverviewSetting { Key = LastRunKey, Value = stamp, UpdatedBy = "system" });
        else { last.Value = stamp; last.UpdatedAt = DateTime.UtcNow; }
        await db.SaveChangesAsync(ct);
        return sent;
    }

    public static async Task<int> SendDigestAsync(ActionPlanDbContext db, INotificationService notifications, DateTime nowUtc, CancellationToken ct)
    {
        var today = nowUtc.Date;
        var weekEnd = today.AddDays(7);

        var actions = await db.PlanActions.AsNoTracking()
            .Where(a => a.AssignedToId != null && a.Progress != ActionProgress.Hundred && a.Deadline != null && a.Deadline < weekEnd)
            .Select(a => new { a.AssignedToId, Late = a.Deadline < today })
            .ToListAsync(ct);
        var claims = await db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.AssignedToId != null && c.Deadline != null && c.Deadline < today
                && c.StatusCode != "CLOTUREE" && c.StatusCode != "CLOSED" && c.StatusCode != "VALIDATED" && c.StatusCode != "DRAFT")
            .Select(c => c.AssignedToId)
            .ToListAsync(ct);

        var perPerson = new Dictionary<string, (int Late, int Soon, int Claims)>(StringComparer.OrdinalIgnoreCase);
        foreach (var g in actions.GroupBy(a => a.AssignedToId!, StringComparer.OrdinalIgnoreCase))
            perPerson[g.Key] = (g.Count(a => a.Late), g.Count(a => !a.Late), 0);
        foreach (var g in claims.GroupBy(c => c!, StringComparer.OrdinalIgnoreCase))
        {
            perPerson.TryGetValue(g.Key, out var cur);
            perPerson[g.Key] = (cur.Late, cur.Soon, g.Count());
        }

        var archived = (await db.UserProfiles.AsNoTracking().Where(p => p.Status == "archived").Select(p => p.UserId).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var sent = 0;
        foreach (var (userId, c) in perPerson)
        {
            if (archived.Contains(userId) || c.Late + c.Soon + c.Claims == 0) continue;
            var parts = new List<string>();
            if (c.Late > 0) parts.Add($"{c.Late} action(s) en retard");
            if (c.Soon > 0) parts.Add($"{c.Soon} action(s) à terminer cette semaine");
            if (c.Claims > 0) parts.Add($"{c.Claims} réclamation(s) en retard");
            await notifications.NotifyAsync(userId, "digest", "Votre résumé", string.Join(" · ", parts) + ".", linkPath: "/dashboard");
            sent++;
        }
        return sent;
    }
}
