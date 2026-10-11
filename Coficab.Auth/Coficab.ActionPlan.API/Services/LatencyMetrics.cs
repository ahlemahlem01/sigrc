using System.Collections.Concurrent;
using System.Diagnostics;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Response times per route (last <see cref="Window"/> requests each), kept in memory to check the
/// "under 300 ms" requirement on real traffic. Read through GET api/metrics/latency (admins only).
/// </summary>
public sealed class LatencyMetrics
{
    public const int TargetMs = 300;
    private const int Window = 500;

    private sealed class Series
    {
        public readonly object Lock = new();
        public readonly double[] Samples = new double[Window];
        public int Count;      // total requests seen
        public double MaxMs;
        public long Over;      // requests above the target
    }

    private readonly ConcurrentDictionary<string, Series> _routes = new();
    private readonly DateTime _since = DateTime.UtcNow;

    public void Record(string route, double elapsedMs)
    {
        var series = _routes.GetOrAdd(route, _ => new Series());
        lock (series.Lock)
        {
            series.Samples[series.Count % Window] = elapsedMs;
            series.Count++;
            if (elapsedMs > series.MaxMs) series.MaxMs = elapsedMs;
            if (elapsedMs > TargetMs) series.Over++;
        }
    }

    public object Snapshot()
    {
        var rows = _routes.Select(kv =>
        {
            lock (kv.Value.Lock)
            {
                var n = Math.Min(kv.Value.Count, Window);
                var sorted = kv.Value.Samples.Take(n).OrderBy(x => x).ToArray();
                double Pct(double p) => n == 0 ? 0 : Math.Round(sorted[Math.Min(n - 1, (int)Math.Ceiling(p * n) - 1)], 1);
                return new
                {
                    route = kv.Key,
                    requests = kv.Value.Count,
                    p50Ms = Pct(0.50),
                    p95Ms = Pct(0.95),
                    maxMs = Math.Round(kv.Value.MaxMs, 1),
                    over300 = kv.Value.Over,
                    meetsTarget = Pct(0.95) <= TargetMs,
                };
            }
        }).OrderByDescending(r => r.p95Ms).ToList();

        var total = rows.Sum(r => (long)r.requests);
        var over = rows.Sum(r => r.over300);
        return new
        {
            since = _since,
            targetMs = TargetMs,
            totalRequests = total,
            shareUnderTargetPct = total == 0 ? 100 : Math.Round((total - over) * 100.0 / total, 1),
            routes = rows,
        };
    }

    public static string KeyFor(HttpContext http)
    {
        var pattern = (http.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? http.Request.Path.Value ?? "?";
        return $"{http.Request.Method} /{pattern.TrimStart('/')}";
    }
}

/// <summary>Times every API request (static files and the SignalR hub are left out).</summary>
public sealed class LatencyMiddleware
{
    private readonly RequestDelegate _next;
    private readonly LatencyMetrics _metrics;

    public LatencyMiddleware(RequestDelegate next, LatencyMetrics metrics)
    {
        _next = next;
        _metrics = metrics;
    }

    public async Task InvokeAsync(HttpContext http)
    {
        var timer = Stopwatch.StartNew();
        try
        {
            await _next(http);
        }
        finally
        {
            timer.Stop();
            var path = http.Request.Path;
            if (path.StartsWithSegments("/api") && !path.StartsWithSegments("/api/metrics"))
                _metrics.Record(LatencyMetrics.KeyFor(http), timer.Elapsed.TotalMilliseconds);
        }
    }
}
