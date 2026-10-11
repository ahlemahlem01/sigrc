using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.MlFeatures.Queries;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

/// <summary>
/// Construit la série DefectType × ProductionLine × semaine (logique partagée avec l'API ml-features).
/// </summary>
public class AnomalyTimeseriesService : IAnomalyTimeseriesService
{
    private readonly IApplicationDbContext _context;

    public AnomalyTimeseriesService(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<AnomalyTimeseriesDto> GetTimeseriesAsync(
        int weeks = 12,
        CancellationToken cancellationToken = default)
    {
        var weekCount = Math.Clamp(weeks, 1, 52);
        var nowUtc = DateTime.UtcNow;
        var currentWeekStart = StartOfWeekUtc(nowUtc);
        var windowStart = currentWeekStart.AddDays(-7 * (weekCount - 1));
        var windowEndExclusive = currentWeekStart.AddDays(7);

        var weekStarts = Enumerable
            .Range(0, weekCount)
            .Select(i => windowStart.AddDays(7 * i))
            .ToList();

        var weekLabels = weekStarts.Select(FormatWeekLabel).ToList();

        var raw = await _context.Claims
            .AsNoTracking()
            .Where(c => !c.IsArchived)
            .Where(c => c.CreatedAt >= windowStart && c.CreatedAt < windowEndExclusive)
            .Select(c => new { c.DefectType, c.ProductionLine, c.CreatedAt })
            .ToListAsync(cancellationToken);

        var buckets = new Dictionary<(string Defect, string Line, DateTime Week), int>();

        foreach (var row in raw)
        {
            var defect = string.IsNullOrWhiteSpace(row.DefectType) ? "UNKNOWN" : row.DefectType.Trim();
            var line = string.IsNullOrWhiteSpace(row.ProductionLine) ? "UNKNOWN" : row.ProductionLine.Trim();
            var week = StartOfWeekUtc(row.CreatedAt);
            if (week < windowStart || week >= windowEndExclusive)
                continue;

            var key = (defect, line, week);
            buckets[key] = buckets.TryGetValue(key, out var n) ? n + 1 : 1;
        }

        var combinations = buckets.Keys
            .Select(k => (k.Defect, k.Line))
            .Distinct()
            .OrderBy(k => k.Defect, StringComparer.OrdinalIgnoreCase)
            .ThenBy(k => k.Line, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var series = combinations
            .Select(combo =>
            {
                var weeksDto = weekStarts
                    .Select(ws =>
                    {
                        buckets.TryGetValue((combo.Defect, combo.Line, ws), out var count);
                        return new AnomalyWeekCountDto(ws, FormatWeekLabel(ws), count);
                    })
                    .ToList();

                return new AnomalySeriesDto(
                    combo.Defect,
                    combo.Line,
                    weeksDto,
                    weeksDto.Sum(w => w.Count)
                );
            })
            .ToList();

        return new AnomalyTimeseriesDto(
            windowStart,
            windowEndExclusive.AddTicks(-1),
            weekCount,
            weekLabels,
            series
        );
    }

    internal static DateTime StartOfWeekUtc(DateTime dt)
    {
        var utc = dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        var diff = ((int)utc.DayOfWeek + 6) % 7;
        return new DateTime(utc.Year, utc.Month, utc.Day, 0, 0, 0, DateTimeKind.Utc).AddDays(-diff);
    }

    internal static string FormatWeekLabel(DateTime weekStartUtc)
    {
        var calendar = System.Globalization.CultureInfo.InvariantCulture.Calendar;
        var week = calendar.GetWeekOfYear(
            weekStartUtc,
            System.Globalization.CalendarWeekRule.FirstFourDayWeek,
            DayOfWeek.Monday
        );
        return $"{weekStartUtc.Year}-W{week:D2}";
    }
}
