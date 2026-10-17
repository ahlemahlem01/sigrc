using Coficab.ActionPlan.Application.Dashboard.Queries;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Coficab.ActionPlan.Application.Dashboard;

/// <summary>
/// The targets of the overview's traffic lights. Order of precedence: what an administrator saved, then the configuration
/// (Overview:*), then the built-in defaults.
/// </summary>
public static class OverviewTargetsStore
{
    public const string OnTimeGreen = "OnTimeGreen";
    public const string OnTimeOrange = "OnTimeOrange";
    public const string ResolutionDays = "ResolutionDays";
    public const string PpmTolerancePct = "PpmTolerancePct";

    public static OverviewTargetsDto Defaults(IConfiguration configuration)
    {
        double Cfg(string key, double fallback) =>
            double.TryParse(configuration["Overview:" + key], System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : fallback;
        return new OverviewTargetsDto(Cfg(OnTimeGreen, 85), Cfg(OnTimeOrange, 70), Cfg(ResolutionDays, 14), Cfg(PpmTolerancePct, 10));
    }

    public static async Task<OverviewTargetsDto> LoadAsync(IApplicationDbContext db, IConfiguration configuration, CancellationToken ct)
    {
        var defaults = Defaults(configuration);
        var saved = await db.OverviewSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        double Pick(string key, double fallback) => saved.TryGetValue(key, out var v) ? v : fallback;
        return new OverviewTargetsDto(
            Pick(OnTimeGreen, defaults.OnTimeGreen),
            Pick(OnTimeOrange, defaults.OnTimeOrange),
            Pick(ResolutionDays, defaults.ResolutionDays),
            Pick(PpmTolerancePct, defaults.PpmTolerancePct));
    }

    /// <summary>Why a set of targets cannot be saved; null when it is valid.</summary>
    public static string? Validate(OverviewTargetsDto t)
    {
        if (t.OnTimeGreen is < 1 or > 100) return "onTimeGreen";
        if (t.OnTimeOrange is < 1 or > 100) return "onTimeOrange";
        if (t.OnTimeOrange >= t.OnTimeGreen) return "onTimeOrderOrange";
        if (t.ResolutionDays is < 1 or > 365) return "resolutionDays";
        if (t.PpmTolerancePct is < 0 or > 100) return "ppmTolerancePct";
        return null;
    }

    public static async Task SaveAsync(IApplicationDbContext db, OverviewTargetsDto targets, string? userId, CancellationToken ct)
    {
        var values = new Dictionary<string, double>
        {
            [OnTimeGreen] = targets.OnTimeGreen,
            [OnTimeOrange] = targets.OnTimeOrange,
            [ResolutionDays] = targets.ResolutionDays,
            [PpmTolerancePct] = targets.PpmTolerancePct,
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

    /// <summary>Back to the configuration / built-in defaults.</summary>
    public static async Task ResetAsync(IApplicationDbContext db, CancellationToken ct)
    {
        db.OverviewSettings.RemoveRange(await db.OverviewSettings.ToListAsync(ct));
        await db.SaveChangesAsync(ct);
    }
}
