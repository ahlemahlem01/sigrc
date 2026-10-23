using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>
/// Every threshold an administrator may tune: the targets of the overview's traffic lights, the days that make an
/// employee active / low activity, and the load that makes someone overloaded. Order of precedence: what the superadmin
/// saved, then the configuration (Overview:*), then the built-in defaults. Kept in the same table as the overview targets.
/// </summary>
public record ThresholdsDto(
    double OnTimeGreen, double OnTimeOrange, double ResolutionDays, double PpmTolerancePct,
    double ActiveDays, double LowActivityDays,
    double OverloadMin, double OverloadFactor);

public static class ThresholdsStore
{
    public const string ActiveDays = "ActiveDays";
    public const string LowActivityDays = "LowActivityDays";
    public const string OverloadMin = "OverloadMin";
    public const string OverloadFactor = "OverloadFactor";

    public const double DefaultActiveDays = 15;
    public const double DefaultLowActivityDays = 60;
    public const double DefaultOverloadMin = 4;
    public const double DefaultOverloadFactor = 1.5;

    public static ThresholdsDto Defaults(IConfiguration configuration)
    {
        var t = OverviewTargetsStore.Defaults(configuration);
        return new ThresholdsDto(t.OnTimeGreen, t.OnTimeOrange, t.ResolutionDays, t.PpmTolerancePct,
            DefaultActiveDays, DefaultLowActivityDays, DefaultOverloadMin, DefaultOverloadFactor);
    }

    public static async Task<ThresholdsDto> LoadAsync(IApplicationDbContext db, IConfiguration configuration, CancellationToken ct)
    {
        var d = Defaults(configuration);
        var saved = await db.OverviewSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        double Pick(string key, double fallback) => saved.TryGetValue(key, out var v) ? v : fallback;
        return new ThresholdsDto(
            Pick(OverviewTargetsStore.OnTimeGreen, d.OnTimeGreen), Pick(OverviewTargetsStore.OnTimeOrange, d.OnTimeOrange),
            Pick(OverviewTargetsStore.ResolutionDays, d.ResolutionDays), Pick(OverviewTargetsStore.PpmTolerancePct, d.PpmTolerancePct),
            Pick(ActiveDays, d.ActiveDays), Pick(LowActivityDays, d.LowActivityDays),
            Pick(OverloadMin, d.OverloadMin), Pick(OverloadFactor, d.OverloadFactor));
    }

    /// <summary>The thresholds used where no configuration is at hand (activity status, workload): saved value or default.</summary>
    public static async Task<(double ActiveDays, double LowActivityDays, double OverloadMin, double OverloadFactor)> LoadCoreAsync(IApplicationDbContext db, CancellationToken ct)
    {
        var saved = await db.OverviewSettings.AsNoTracking()
            .Where(s => s.Key == ActiveDays || s.Key == LowActivityDays || s.Key == OverloadMin || s.Key == OverloadFactor)
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        double Pick(string key, double fallback) => saved.TryGetValue(key, out var v) ? v : fallback;
        return (Pick(ActiveDays, DefaultActiveDays), Pick(LowActivityDays, DefaultLowActivityDays), Pick(OverloadMin, DefaultOverloadMin), Pick(OverloadFactor, DefaultOverloadFactor));
    }

    /// <summary>Why a set of thresholds cannot be saved (name of the first invalid field); null when valid.</summary>
    public static string? Validate(ThresholdsDto t)
    {
        var targets = OverviewTargetsStore.Validate(new Queries.OverviewTargetsDto(t.OnTimeGreen, t.OnTimeOrange, t.ResolutionDays, t.PpmTolerancePct));
        if (targets != null) return targets;
        if (t.ActiveDays is < 1 or > 365) return "activeDays";
        if (t.LowActivityDays <= t.ActiveDays || t.LowActivityDays > 730) return "lowActivityDays";
        if (t.OverloadMin is < 1 or > 100) return "overloadMin";
        if (t.OverloadFactor is < 1 or > 10) return "overloadFactor";
        return null;
    }

    public static async Task SaveAsync(IApplicationDbContext db, ThresholdsDto t, string? userId, CancellationToken ct)
    {
        var values = new Dictionary<string, double>
        {
            [OverviewTargetsStore.OnTimeGreen] = t.OnTimeGreen,
            [OverviewTargetsStore.OnTimeOrange] = t.OnTimeOrange,
            [OverviewTargetsStore.ResolutionDays] = t.ResolutionDays,
            [OverviewTargetsStore.PpmTolerancePct] = t.PpmTolerancePct,
            [ActiveDays] = t.ActiveDays,
            [LowActivityDays] = t.LowActivityDays,
            [OverloadMin] = t.OverloadMin,
            [OverloadFactor] = t.OverloadFactor,
        };
        var existing = await db.OverviewSettings.ToDictionaryAsync(s => s.Key, ct);
        foreach (var (key, value) in values)
        {
            if (existing.TryGetValue(key, out var row))
            {
                row.Value = value;
                row.UpdatedAt = DateTime.UtcNow;
                row.UpdatedBy = userId;
            }
            else
            {
                db.OverviewSettings.Add(new OverviewSetting { Key = key, Value = value, UpdatedAt = DateTime.UtcNow, UpdatedBy = userId });
            }
        }
        await db.SaveChangesAsync(ct);
    }
}
