using System.Net;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

/// <summary>
/// The free tier of the AI service allows few requests per model and per day, and a model is sometimes overloaded. When a
/// generation request is answered "quota reached" (429) or "overloaded" (503), the same request is sent to the next model of
/// Gemini:FallbackModels (their quotas are separate), so every screen that uses the AI benefits without changing its code.
/// A model that does not answer within a few seconds counts as overloaded, so that one slow model never holds the chain.
/// Anything else (success, a refused request, another service) goes through untouched.
/// </summary>
public sealed class GeminiModelFallbackHandler : DelegatingHandler
{
    private static readonly Regex ModelInPath = new(@"/models/(?<model>[^/:]+):generateContent", RegexOptions.Compiled);

    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiModelFallbackHandler> _logger;

    public GeminiModelFallbackHandler(IConfiguration configuration, ILogger<GeminiModelFallbackHandler> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var uri = request.RequestUri;
        if (uri is null || !uri.Host.Equals("generativelanguage.googleapis.com", StringComparison.OrdinalIgnoreCase)
            || request.Method != HttpMethod.Post || !ModelInPath.IsMatch(uri.AbsolutePath))
            return await base.SendAsync(request, cancellationToken);

        var primary = ModelInPath.Match(uri.AbsolutePath).Groups["model"].Value;
        var models = new List<string> { primary };
        foreach (var name in (_configuration["Gemini:FallbackModels"] ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            if (!models.Contains(name, StringComparer.OrdinalIgnoreCase)) models.Add(name);

        // the body is read once so that it can be sent again to another model
        byte[]? body = request.Content is null ? null : await request.Content.ReadAsByteArrayAsync(cancellationToken);
        var contentHeaders = request.Content?.Headers.ToList();

        // one slow model must not hold the chain, and the whole chain must end before the client's own time limit
        var attemptLimit = TimeSpan.FromSeconds(double.TryParse(_configuration["Gemini:AttemptTimeoutSeconds"], System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var seconds) && seconds > 0 ? seconds : 20);
        var chainLimit = TimeSpan.FromSeconds(80);
        var clock = System.Diagnostics.Stopwatch.StartNew();

        HttpResponseMessage? last = null;
        for (var i = 0; i < models.Count; i++)
        {
            var attempt = Clone(request, uri, primary, models[i], body, contentHeaders);

            last?.Dispose();
            using var limit = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            limit.CancelAfter(attemptLimit);
            try
            {
                last = await base.SendAsync(attempt, limit.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                last = new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);   // no answer in time: the model counts as overloaded
            }

            if (last.StatusCode != HttpStatusCode.TooManyRequests && last.StatusCode != HttpStatusCode.ServiceUnavailable) return last;
            if (clock.Elapsed > chainLimit) break;

            if (i < models.Count - 1)
                _logger.LogWarning("Gemini {Model} answered {Status}: trying {Next}", models[i], (int)last.StatusCode, models[i + 1]);
        }
        return last!;
    }

    private static HttpRequestMessage Clone(HttpRequestMessage original, Uri uri, string from, string to, byte[]? body, List<KeyValuePair<string, IEnumerable<string>>>? contentHeaders)
    {
        var url = uri.AbsoluteUri.Replace($"/models/{from}:", $"/models/{to}:", StringComparison.Ordinal);
        var clone = new HttpRequestMessage(original.Method, url) { Version = original.Version };
        foreach (var header in original.Headers) clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        if (body is not null)
        {
            clone.Content = new ByteArrayContent(body);
            foreach (var header in contentHeaders!) clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }
        return clone;
    }
}
