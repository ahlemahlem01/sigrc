using Coficab.ActionPlan.Application.MlFeatures;
using Coficab.ActionPlan.Core.DTOs.Employee;

namespace Coficab.ActionPlan.Application.Badges;

/// <summary>A claim the employee closed, with the only fact the badge rules need.</summary>
public sealed record ClosedClaim(DateTime CompletedAt, bool OnTime);

/// <summary>
/// Levels at which the volume badges are earned. The floors are the minimum; when enough colleagues have a record the
/// levels follow the team (median and upper percentiles), so a badge stays selective whatever the team's volume.
/// </summary>
public sealed record BadgeThresholds(int SilverOnTime, int GoldOnTime, int StreakSolid, int StreakElite)
{
    public const int FloorSilver = 10, FloorGold = 25, FloorStreakSolid = 5, FloorStreakElite = 10;
    public const int MinPeers = 8;

    public static readonly BadgeThresholds Floors = new(FloorSilver, FloorGold, FloorStreakSolid, FloorStreakElite);

    /// <summary>Per colleague: number of on-time closures and longest run of on-time closures.</summary>
    public static BadgeThresholds FromTeam(IReadOnlyCollection<(int OnTime, int LongestRun)> team)
    {
        if (team.Count < MinPeers) return Floors;
        var onTime = team.Select(t => t.OnTime).ToList();
        var runs = team.Select(t => t.LongestRun).ToList();
        return new BadgeThresholds(
            Math.Max(FloorSilver, BadgeRules.Percentile(onTime, 0.50)),
            Math.Max(FloorGold, BadgeRules.Percentile(onTime, 0.75)),
            Math.Max(FloorStreakSolid, BadgeRules.Percentile(runs, 0.50)),
            Math.Max(FloorStreakElite, BadgeRules.Percentile(runs, 0.90)));
    }
}

/// <summary>
/// Which badges an employee has earned, from the outcomes of the claims they closed. Pure functions: the service
/// loads the data, awards what is returned (each badge name is awarded once) and nothing here touches the database.
/// </summary>
public static class BadgeRules
{
    public const int PerfectQuarterMinClaims = 3;

    /// <summary>"Reliable" needs this many closed claims, and a rate in the top share of the colleagues who also have them.</summary>
    public const int ReliableMinClosed = 20;
    public const int ReliableMinPeers = 4;
    public const double ReliableTopShare = 0.25;

    /// <summary>Nearest-rank percentile of a list of counts (p between 0 and 1).</summary>
    public static int Percentile(IReadOnlyCollection<int> values, double p)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        var index = (int)Math.Ceiling(p * sorted.Count) - 1;
        return sorted[Math.Clamp(index, 0, sorted.Count - 1)];
    }

    public static IReadOnlyList<AwardBadgeDto> Earned(
        IReadOnlyList<ClosedClaim> claims, bool reliable, DateTime nowUtc, BadgeThresholds? thresholds = null)
    {
        thresholds ??= BadgeThresholds.Floors;
        var badges = new List<AwardBadgeDto>();
        var ordered = claims.OrderBy(c => c.CompletedAt).ToList();

        var onTime = ordered.Count(c => c.OnTime);
        var tiers = new[]
        {
            (Needed: 1, Tier: "Bronze", Icon: "🥉", Color: "#b45309"),
            (Needed: thresholds.SilverOnTime, Tier: "Argent", Icon: "🥈", Color: "#64748b"),
            (Needed: thresholds.GoldOnTime, Tier: "Or", Icon: "🥇", Color: "#ca8a04"),
        };
        foreach (var (needed, tier, icon, color) in tiers)
        {
            if (onTime < needed) continue;
            badges.Add(new AwardBadgeDto
            {
                Category = "speed",
                Name = $"Rapidité {tier}",
                Description = needed == 1
                    ? "Première réclamation clôturée dans les délais."
                    : $"{needed} réclamations clôturées dans les délais ou plus (seuil actuel de l'équipe).",
                Icon = icon,
                Color = color,
            });
        }

        var longest = LongestOnTimeRun(ordered);
        var streaks = new[]
        {
            (Needed: thresholds.StreakSolid, Name: "Série solide"),
            (Needed: thresholds.StreakElite, Name: "Série d'élite"),
        };
        foreach (var (needed, name) in streaks.Where(x => longest >= x.Needed))
            badges.Add(new AwardBadgeDto
            {
                Category = "streak",
                Name = name,
                Description = $"{needed} réclamations de suite clôturées dans les délais ou plus (seuil actuel de l'équipe).",
                Icon = "🔥",
                Color = "#ea580c",
            });

        foreach (var q in ordered.GroupBy(c => (c.CompletedAt.Year, Quarter: (c.CompletedAt.Month - 1) / 3 + 1)).OrderBy(g => g.Key))
        {
            var quarterEnd = new DateTime(q.Key.Year, (q.Key.Quarter - 1) * 3 + 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(3);
            if (quarterEnd > nowUtc) continue; // a quarter that is not over can still go wrong
            if (q.Count() < PerfectQuarterMinClaims || q.Any(c => !c.OnTime)) continue;
            badges.Add(new AwardBadgeDto
            {
                Category = "perfect_quarter",
                Name = $"Trimestre parfait T{q.Key.Quarter} {q.Key.Year}",
                Description = $"Toutes les réclamations clôturées au T{q.Key.Quarter} {q.Key.Year} l'ont été dans les délais ({q.Count()}).",
                Icon = "🏆",
                Color = "#7c3aed",
            });
        }

        if (reliable)
            badges.Add(new AwardBadgeDto
            {
                Category = "reliable",
                Name = "Fiabilité · meilleurs 25 %",
                Description = $"Taux de ponctualité parmi les 25 % les plus élevés de l'équipe (au moins {ReliableMinClosed} réclamations clôturées).",
                Icon = "⭐",
                Color = "#0d9488",
            });

        return badges;
    }

    public static int LongestOnTimeRun(IEnumerable<ClosedClaim> inClosingOrder)
    {
        int best = 0, run = 0;
        foreach (var c in inClosingOrder)
        {
            run = c.OnTime ? run + 1 : 0;
            best = Math.Max(best, run);
        }
        return best;
    }

    /// <summary>
    /// Smoothed on-time rate (same smoothing as the recommendation model) that puts an employee in the top share of the
    /// team. Null when there are too few comparable colleagues for a percentile to mean anything.
    /// </summary>
    public static double? ReliabilityCutoff(IEnumerable<(int OnTime, int Closed)> employees, double teamRate)
    {
        var rates = employees
            .Where(e => e.Closed >= ReliableMinClosed)
            .Select(e => EmployeeHistory.SmoothedRate(e.OnTime, e.Closed, teamRate))
            .OrderBy(r => r)
            .ToList();
        if (rates.Count < ReliableMinPeers) return null;
        var index = (int)Math.Ceiling((1 - ReliableTopShare) * rates.Count) - 1;
        return rates[Math.Clamp(index, 0, rates.Count - 1)];
    }

    public static bool IsReliable(int onTime, int closed, double teamRate, double? cutoff) =>
        cutoff != null
        && closed >= ReliableMinClosed
        && EmployeeHistory.SmoothedRate(onTime, closed, teamRate) is var rate
        && rate >= cutoff.Value
        && rate > teamRate;
}
