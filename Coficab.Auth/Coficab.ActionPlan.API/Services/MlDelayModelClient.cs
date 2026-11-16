using System.Globalization;
using System.Text;
using System.Text.Json;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Calls POST /estimate-delay of the ML service. The service only answers when its delay model passed the validation gate;
/// any other situation (model missing, not validated, service down, slow answer) gives null and the percentiles are used.
/// </summary>
public sealed class MlDelayModelClient : IDelayModelClient
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<MlDelayModelClient> _logger;

    public MlDelayModelClient(IHttpClientFactory http, IConfiguration config, ILogger<MlDelayModelClient> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    public async Task<DelayModelEstimate?> TryEstimateAsync(string? defectType, string? severity, ClaimEstimateContext context, CancellationToken cancellationToken = default)
    {
        if (string.Equals(_config["DelayModel:Enabled"], "false", StringComparison.OrdinalIgnoreCase)) return null;

        var baseUrl = (_config["MlService:BaseUrl"] ?? "http://127.0.0.1:8001").TrimEnd('/');
        var body = JsonSerializer.Serialize(new
        {
            DefectType = defectType,
            Severity = severity,
            ClientId = context.ClientId,
            ProductionLine = context.ProductionLine,
            Shift = context.Shift,
            IsInternal = context.IsInternal,
            ProducedQuantity = context.ProducedQuantity,
            DefectiveQuantity = context.DefectiveQuantity,
            AssigneeId = context.AssigneeId,
            Month = context.Month ?? DateTime.UtcNow.Month,
        });

        try
        {
            using var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(3);   // the estimate is asked while a claim is created: never make the user wait
            using var content = new StringContent(body, Encoding.UTF8, "application/json");
            using var response = await client.PostAsync($"{baseUrl}/estimate-delay", content, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            var root = doc.RootElement;
            if (!root.TryGetProperty("available", out var available) || available.ValueKind != JsonValueKind.True) return null;
            if (!root.TryGetProperty("daysP50", out var p50) || !root.TryGetProperty("daysP80", out var p80)) return null;
            int? rows = root.TryGetProperty("trainRows", out var tr) && tr.ValueKind == JsonValueKind.Number ? tr.GetInt32() : null;
            return new DelayModelEstimate(p50.GetDouble(), p80.GetDouble(), rows);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or FormatException)
        {
            _logger.LogDebug(ex, "Delay model unavailable, percentiles are used");
            return null;
        }
    }
}
