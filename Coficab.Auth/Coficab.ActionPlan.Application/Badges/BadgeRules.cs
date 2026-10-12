using Coficab.ActionPlan.Application.MlFeatures;
using Coficab.ActionPlan.Core.DTOs.Employee;

namespace Coficab.ActionPlan.Application.Badges;

/// <summary>A claim the employee closed, with the only fact the badge rules need.</summary>
public sealed record ClosedClaim(DateTime CompletedAt, bool OnTime);

/// <summary>
/// Which badges an employee has earned, from the outcomes of the claims they closed. Pure functions: the service
/// loads the data, awards what is returned (each badge name is awarded once) and nothing here touches the database.
/// </summary>
public static class BadgeRules
{
    /// <summary>Number of on-time closures needed for each speed tier.</summary>
    public static readonly (int OnTime, string Tier, string Icon, string Color)[] SpeedTiers =
    {
        (1, "Bronze", "🥉", "#b45309"),
        (10, "Argent", "🥈", "#64748b"),
        (25, "Or", "🥇", "#ca8a04"),
    };

    /// <summary>Consecutive on-time closures (in closing order) that earn a streak badge.</summary>
    public static readonly int[] StreakLevels = { 5, 10 };

    public const int PerfectQuarterMinClaims = 3;

    /// <summary>"Reliable" needs this many closed claims, and a rate in the top share of the colleagues who also have them.</summary>
    public const int ReliableMinClosed = 20;
    public const int ReliableMinPeers = 4;
    public const double ReliableTopShare = 0.25;

    public static IReadOnlyList<AwardBadgeDto> Earned(IReadOnlyList<ClosedClaim> claims, bool reliable, DateTime nowUtc)
    {
        var badges = new List<AwardBadgeDto>();
        var ordered = claims.OrderBy(c => c.CompletedAt).ToList();

        var onTime = ordered.Count(c => c.OnTime);
        foreach (var (needed, tier, icon, color) in SpeedTiers)
        {
            if (onTime < needed) continue;
            badges.Add(new AwardBadgeDto
            {
                Category = "speed",
                Name = $"Rapidité {tier}",
                Description = needed == 1
                    ? "Première réclamation clôturée dans les délais."
                    : $"{needed} réclamations clôturées dans les délais.",
                Icon = icon,
                Color = color,
            });
        }

        var longest = LongestOnTimeRun(ordered);
        foreach (var level in StreakLevels.Where(l => longest >= l))
            badges.Add(new AwardBadgeDto
            {
                Category = "streak",
                Name = $"Série de {level}",
                Description = $"{level} réclamations de suite clôturées dans les délais.",
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
