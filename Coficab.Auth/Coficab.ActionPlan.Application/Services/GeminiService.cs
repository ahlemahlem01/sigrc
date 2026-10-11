using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

public interface IGeminiService
{
    /// <summary>
    /// Génère du texte brut via Google Gemini (réutilise la config Gemini:*).
    /// </summary>
    Task<string> GenerateTextAsync(
        string prompt,
        double temperature = 0.4,
        int maxOutputTokens = 4096,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Génère un embedding vectoriel (Gemini text-embedding-004 par défaut).
    /// </summary>
    Task<float[]> EmbedAsync(
        string text,
        bool forQuery = false,
        CancellationToken cancellationToken = default);
}

public class GeminiService : IGeminiService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiService> _logger;

    public GeminiService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<GeminiService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string> GenerateTextAsync(
        string prompt,
        double temperature = 0.4,
        int maxOutputTokens = 4096,
        CancellationToken cancellationToken = default)
    {
        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-3.6-flash";

        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("La clé d'API Gemini n'est pas configurée.");

        var requestPayload = new
        {
            contents = new[]
            {
                new
                {
                    parts = new[]
                    {
                        new { text = prompt }
                    }
                }
            },
            generationConfig = new
            {
                temperature,
                maxOutputTokens,
                thinkingConfig = new
                {
                    thinkingLevel = "low"
                }
            }
        };

        var httpClient = _httpClientFactory.CreateClient();
        var endpoint =
            $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsJsonAsync(endpoint, requestPayload, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Impossible de joindre Gemini");
            throw new InvalidOperationException($"Impossible de contacter le service IA : {ex.Message}", ex);
        }

        var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Gemini HTTP {Status}: {Body}", (int)response.StatusCode, responseJson);
            throw new InvalidOperationException($"Erreur lors de la génération IA ({(int)response.StatusCode}).");
        }

        using var doc = JsonDocument.Parse(responseJson);
        var root = doc.RootElement;

        if (!root.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
        {
            var blockReason = root.TryGetProperty("promptFeedback", out var feedback) &&
                              feedback.TryGetProperty("blockReason", out var reason)
                ? reason.GetString()
                : null;

            throw new InvalidOperationException(
                blockReason != null
                    ? $"La génération IA a été bloquée ({blockReason})."
                    : "La génération IA n'a retourné aucun résultat exploitable.");
        }

        var first = candidates[0];
        if (!first.TryGetProperty("content", out var content) ||
            !content.TryGetProperty("parts", out var parts) ||
            parts.GetArrayLength() == 0 ||
            !parts[0].TryGetProperty("text", out var textElement))
        {
            throw new InvalidOperationException("Réponse IA dans un format inattendu.");
        }

        return CleanPlainText(textElement.GetString() ?? string.Empty);
    }

    public async Task<float[]> EmbedAsync(
        string text,
        bool forQuery = false,
        CancellationToken cancellationToken = default)
    {
        var apiKey = _configuration["Gemini:ApiKey"];
        var preferred = _configuration["Gemini:EmbeddingModel"] ?? "gemini-embedding-001";
        var candidates = new[]
        {
            preferred,
            "gemini-embedding-001",
            "gemini-embedding-2",
            "text-embedding-004",
            "embedding-001",
        }.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("La clé d'API Gemini n'est pas configurée.");

        var trimmed = (text ?? string.Empty).Trim();
        if (trimmed.Length == 0)
            throw new ArgumentException("Le texte à embedder est vide.", nameof(text));

        if (trimmed.Length > 8000)
            trimmed = trimmed[..8000];

        var requestPayload = new
        {
            content = new
            {
                parts = new[] { new { text = trimmed } }
            },
            taskType = forQuery ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT"
        };

        var httpClient = _httpClientFactory.CreateClient();
        Exception? lastError = null;

        foreach (var model in candidates)
        {
            var endpoint =
                $"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={apiKey}";

            HttpResponseMessage response;
            try
            {
                response = await httpClient.PostAsJsonAsync(endpoint, requestPayload, cancellationToken);
            }
            catch (HttpRequestException ex)
            {
                lastError = ex;
                _logger.LogWarning(ex, "Impossible de joindre Gemini Embeddings ({Model})", model);
                continue;
            }

            var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini Embed HTTP {Status} ({Model}): {Body}",
                    (int)response.StatusCode, model,
                    responseJson.Length > 300 ? responseJson[..300] : responseJson);
                lastError = new InvalidOperationException($"Erreur embedding IA ({(int)response.StatusCode}) pour {model}.");
                // Try next model on 404 (model not available for this key).
                if ((int)response.StatusCode == 404) continue;
                throw lastError;
            }

            using var doc = JsonDocument.Parse(responseJson);
            var root = doc.RootElement;
            if (!root.TryGetProperty("embedding", out var embedding) ||
                !embedding.TryGetProperty("values", out var values) ||
                values.ValueKind != JsonValueKind.Array)
            {
                throw new InvalidOperationException("Réponse embedding dans un format inattendu.");
            }

            var list = new List<float>(values.GetArrayLength());
            foreach (var v in values.EnumerateArray())
                list.Add(v.GetSingle());

            if (list.Count == 0)
                throw new InvalidOperationException("Embedding vide.");

            return list.ToArray();
        }

        throw lastError ?? new InvalidOperationException("Aucun modèle d'embedding Gemini disponible.");
    }

    private static string CleanPlainText(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;

        var cleaned = text.Trim();
        var introPrefixes = new[]
        {
            "Voici la synthèse", "Voici le rapport", "Voici", "Synthèse :", "Synthèse:", "Rapport :"
        };
        foreach (var prefix in introPrefixes)
        {
            if (cleaned.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                var colonIdx = cleaned.IndexOf(':');
                if (colonIdx >= 0 && colonIdx < 80)
                    cleaned = cleaned[(colonIdx + 1)..].Trim();
                break;
            }
        }

        cleaned = cleaned.Replace("**", "").Replace("__", "");
        cleaned = Regex.Replace(cleaned, @"(?m)^\s*[-*•]\s+", "");
        cleaned = cleaned.Trim('"', '\'', ' ', '\n', '\r');
        return cleaned;
    }
}
