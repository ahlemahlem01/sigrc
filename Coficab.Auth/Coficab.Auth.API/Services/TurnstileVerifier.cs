using System.Text.Json;

namespace Coficab.Auth.API.Services;

/// <summary>
/// Cloudflare Turnstile: the "are you a person?" check shown on the sign-in and forgot-password forms. It is switched on by setting
/// Turnstile:SecretKey (and Turnstile:SiteKey for the widget); without a secret nothing is asked and nothing changes.
/// </summary>
public interface ITurnstileVerifier
{
    bool Enabled { get; }

    /// <summary>The public key the widget needs (never the secret).</summary>
    string? SiteKey { get; }

    /// <summary>True when the check is off, or when Cloudflare confirms the token. A token works once.</summary>
    Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default);
}

public sealed class TurnstileVerifier : ITurnstileVerifier
{
    public const string Endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    private const int MaxTokenLength = 2048;       // Cloudflare's own limit

    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<TurnstileVerifier> _logger;

    public TurnstileVerifier(IConfiguration config, IHttpClientFactory http, ILogger<TurnstileVerifier> logger)
    {
        _config = config;
        _http = http;
        _logger = logger;
    }

    private string? Secret => _config["Turnstile:SecretKey"];

    public bool Enabled => !string.IsNullOrWhiteSpace(Secret);

    public string? SiteKey => _config["Turnstile:SiteKey"];

    public async Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default)
    {
        if (!Enabled) return true;
        if (string.IsNullOrWhiteSpace(token) || token.Length > MaxTokenLength) return false;

        try
        {
            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(5);
            var form = new Dictionary<string, string> { ["secret"] = Secret!, ["response"] = token };
            if (!string.IsNullOrWhiteSpace(remoteIp)) form["remoteip"] = remoteIp;

            using var response = await client.PostAsync(Endpoint, new FormUrlEncodedContent(form), ct);
            if (!response.IsSuccessStatusCode) return OnCloudflareUnavailable($"HTTP {(int)response.StatusCode}");
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            return json.RootElement.TryGetProperty("success", out var ok) && ok.GetBoolean();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            return OnCloudflareUnavailable(ex.GetType().Name);
        }
    }

    /// <summary>Cloudflare cannot be reached: by default the check fails (a bot must not get through because the service is down);
    /// Turnstile:FailOpen=true lets people sign in anyway, for a site that cannot reach the Internet.</summary>
    private bool OnCloudflareUnavailable(string reason)
    {
        var failOpen = _config.GetValue("Turnstile:FailOpen", false);
        _logger.LogWarning("Turnstile could not be verified ({Reason}); {Outcome}", reason, failOpen ? "letting the request through (FailOpen)" : "refusing the request");
        return failOpen;
    }
}
