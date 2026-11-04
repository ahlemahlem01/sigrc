using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

/// <summary>
/// Lets the application run its AI on a local Ollama server instead of Google Gemini, without changing any caller. When
/// Llm:Provider is "ollama", every request addressed to the Gemini API (text generation, answers with tools, image analysis,
/// embeddings) is translated into the Ollama API, sent to Ollama:BaseUrl, and the answer is translated back into the Gemini
/// format. If Ollama does not answer and a real Gemini key is configured, the original request goes to Gemini (the fallback).
/// With any other provider, requests go through untouched.
/// </summary>
public sealed class OllamaBridgeHandler : DelegatingHandler
{
    public const string PlaceholderKey = "ollama-local";
    public const string PurposeHeader = "X-Llm-Purpose";

    private static readonly Regex GeminiPath = new(@"/models/(?<model>[^/:]+):(?<op>generateContent|embedContent)", RegexOptions.Compiled);

    private readonly IConfiguration _configuration;
    private readonly ILogger<OllamaBridgeHandler> _logger;

    public OllamaBridgeHandler(IConfiguration configuration, ILogger<OllamaBridgeHandler> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public static bool IsOllamaSelected(IConfiguration configuration) =>
        string.Equals(configuration["Llm:Provider"], "ollama", StringComparison.OrdinalIgnoreCase);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var uri = request.RequestUri;
        if (!IsOllamaSelected(_configuration) || uri is null || request.Method != HttpMethod.Post
            || !uri.Host.Equals("generativelanguage.googleapis.com", StringComparison.OrdinalIgnoreCase)
            || !GeminiPath.IsMatch(uri.AbsolutePath))
            return await base.SendAsync(request, cancellationToken);

        var op = GeminiPath.Match(uri.AbsolutePath).Groups["op"].Value;
        var body = request.Content is null ? "{}" : await request.Content.ReadAsStringAsync(cancellationToken);
        var geminiKey = System.Web.HttpUtility.ParseQueryString(uri.Query)["key"];
        var canFallBack = !string.IsNullOrWhiteSpace(geminiKey) && geminiKey != PlaceholderKey;

        // The 5 Why coach must stay strict about people being blamed instead of the system: it stays on Gemini (when a key is set)
        // unless Llm:CoachProvider is "ollama".
        var coach = request.Headers.TryGetValues(PurposeHeader, out var purpose) && purpose.Contains("coach");
        if (coach) request.Headers.Remove(PurposeHeader);
        if (coach && canFallBack && !string.Equals(_configuration["Llm:CoachProvider"], "ollama", StringComparison.OrdinalIgnoreCase))
            return await base.SendAsync(request, cancellationToken);

        // A 3-billion-parameter vision model answers "no defect" on most real photos: with a Gemini key, photos stay on Gemini
        // unless Llm:VisionProvider is set to "ollama" (the text and the assistant still use Ollama).
        if (op == "generateContent" && canFallBack && !string.Equals(_configuration["Llm:VisionProvider"], "ollama", StringComparison.OrdinalIgnoreCase)
            && (body.Contains("\"inline_data\"") || body.Contains("\"inlineData\"")))
            return await base.SendAsync(request, cancellationToken);

        try
        {
            var response = op == "embedContent"
                ? await EmbedAsync(body, cancellationToken)
                : await GenerateAsync(body, cancellationToken);
            if ((int)response.StatusCode < 500 || !canFallBack) return response;
            _logger.LogWarning("Ollama answered {Status}: falling back to Gemini", (int)response.StatusCode);
            response.Dispose();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            if (!canFallBack)
                throw new HttpRequestException($"Ollama est injoignable ({_configuration["Ollama:BaseUrl"] ?? DefaultBaseUrl}) : {ex.Message}", ex);
            _logger.LogWarning(ex, "Ollama unreachable: falling back to Gemini");
        }

        var again = new HttpRequestMessage(HttpMethod.Post, uri) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        return await base.SendAsync(again, cancellationToken);
    }

    private const string DefaultBaseUrl = "http://localhost:11434";

    private Uri OllamaUrl(string path) =>
        new($"{(_configuration["Ollama:BaseUrl"] ?? DefaultBaseUrl).TrimEnd('/')}{path}");

    // ───────────────────────────── generation ─────────────────────────────

    private async Task<HttpResponseMessage> GenerateAsync(string geminiBody, CancellationToken ct)
    {
        var src = JsonNode.Parse(geminiBody)?.AsObject() ?? new JsonObject();
        var messages = new JsonArray();
        var hasImage = false;

        var system = (src["system_instruction"] ?? src["systemInstruction"])?["parts"]?.AsArray();
        if (system is { Count: > 0 })
            messages.Add(new JsonObject { ["role"] = "system", ["content"] = string.Join("\n", system.Select(p => p?["text"]?.GetValue<string>() ?? "")) });

        foreach (var turn in src["contents"]?.AsArray() ?? new JsonArray())
        {
            var role = turn?["role"]?.GetValue<string>() == "model" ? "assistant" : "user";
            var text = new StringBuilder();
            var images = new JsonArray();
            var calls = new JsonArray();
            foreach (var part in turn?["parts"]?.AsArray() ?? new JsonArray())
            {
                if (part is null) continue;
                if (part["text"] is { } t) text.Append(t.GetValue<string>());
                var inline = part["inline_data"] ?? part["inlineData"];
                if (inline is not null) { images.Add(inline["data"]?.GetValue<string>()); hasImage = true; }
                if (part["functionCall"] is { } fc)
                    calls.Add(new JsonObject { ["function"] = new JsonObject { ["name"] = fc["name"]?.DeepClone(), ["arguments"] = fc["args"]?.DeepClone() ?? new JsonObject() } });
                if (part["functionResponse"] is { } fr)
                    messages.Add(new JsonObject { ["role"] = "tool", ["tool_name"] = fr["name"]?.DeepClone(), ["content"] = fr["response"]?.ToJsonString() ?? "{}" });
            }
            if (text.Length == 0 && images.Count == 0 && calls.Count == 0) continue;
            var msg = new JsonObject { ["role"] = role, ["content"] = text.ToString() };
            if (images.Count > 0) msg["images"] = images;
            if (calls.Count > 0) msg["tool_calls"] = calls;
            messages.Add(msg);
        }

        var cfg = src["generationConfig"];
        var options = new JsonObject();
        if (cfg?["temperature"] is { } temp) options["temperature"] = temp.DeepClone();
        if (cfg?["maxOutputTokens"] is { } max) options["num_predict"] = max.DeepClone();
        options["num_ctx"] = int.TryParse(_configuration["Ollama:ContextTokens"], out var ctx) && ctx > 0 ? ctx : 4096;

        var payload = new JsonObject
        {
            ["model"] = hasImage
                ? _configuration["Ollama:VisionModel"] ?? "qwen2.5vl:3b"
                : _configuration["Ollama:Model"] ?? "qwen2.5:3b",
            ["messages"] = messages,
            ["stream"] = false,
            ["keep_alive"] = _configuration["Ollama:KeepAlive"] ?? "30m",
            ["options"] = options,
        };
        if (cfg?["responseMimeType"]?.GetValue<string>() == "application/json") payload["format"] = "json";

        var declarations = src["tools"]?.AsArray().SelectMany(t => t?["functionDeclarations"]?.AsArray() ?? new JsonArray()).ToList();
        if (declarations is { Count: > 0 })
        {
            var tools = new JsonArray();
            foreach (var d in declarations)
                tools.Add(new JsonObject
                {
                    ["type"] = "function",
                    ["function"] = new JsonObject
                    {
                        ["name"] = d?["name"]?.DeepClone(),
                        ["description"] = d?["description"]?.DeepClone(),
                        ["parameters"] = LowerTypes(d?["parameters"]) ?? new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() },
                    }
                });
            payload["tools"] = tools;
        }

        using var http = await base.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, OllamaUrl("/api/chat")) { Content = JsonContent.Create(payload) }, ct);
        var raw = await http.Content.ReadAsStringAsync(ct);
        if (!http.IsSuccessStatusCode)
        {
            _logger.LogWarning("Ollama chat HTTP {Status}: {Body}", (int)http.StatusCode, raw.Length > 300 ? raw[..300] : raw);
            return Reply(http.StatusCode, new JsonObject { ["error"] = new JsonObject { ["message"] = raw } });
        }

        var message = JsonNode.Parse(raw)?["message"];
        var parts = new JsonArray();
        var content = message?["content"]?.GetValue<string>();
        foreach (var call in message?["tool_calls"]?.AsArray() ?? new JsonArray())
        {
            var fn = call?["function"];
            var args = fn?["arguments"];
            if (args is JsonValue v && v.TryGetValue<string>(out var s)) args = JsonNode.Parse(s);
            parts.Add(new JsonObject { ["functionCall"] = new JsonObject { ["name"] = fn?["name"]?.DeepClone(), ["args"] = args?.DeepClone() ?? new JsonObject() } });
        }
        if (parts.Count == 0 || !string.IsNullOrWhiteSpace(content))
            parts.Insert(0, new JsonObject { ["text"] = content ?? string.Empty });

        return Reply(HttpStatusCode.OK, new JsonObject
        {
            ["candidates"] = new JsonArray(new JsonObject
            {
                ["content"] = new JsonObject { ["role"] = "model", ["parts"] = parts },
                ["finishReason"] = "STOP",
            })
        });
    }

    // ───────────────────────────── embeddings ─────────────────────────────

    private async Task<HttpResponseMessage> EmbedAsync(string geminiBody, CancellationToken ct)
    {
        var text = string.Join("\n", (JsonNode.Parse(geminiBody)?["content"]?["parts"]?.AsArray() ?? new JsonArray())
            .Select(p => p?["text"]?.GetValue<string>() ?? ""));
        var payload = new JsonObject
        {
            ["model"] = EmbeddingModel(_configuration),
            ["input"] = text,
            ["keep_alive"] = _configuration["Ollama:KeepAlive"] ?? "30m",
        };

        using var http = await base.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, OllamaUrl("/api/embed")) { Content = JsonContent.Create(payload) }, ct);
        var raw = await http.Content.ReadAsStringAsync(ct);
        if (!http.IsSuccessStatusCode)
        {
            _logger.LogWarning("Ollama embed HTTP {Status}: {Body}", (int)http.StatusCode, raw.Length > 300 ? raw[..300] : raw);
            return Reply(http.StatusCode, new JsonObject { ["error"] = new JsonObject { ["message"] = raw } });
        }

        var vector = JsonNode.Parse(raw)?["embeddings"]?.AsArray().FirstOrDefault();
        return Reply(HttpStatusCode.OK, new JsonObject { ["embedding"] = new JsonObject { ["values"] = vector?.DeepClone() ?? new JsonArray() } });
    }

    /// <summary>Name stored with each embedding, so that vectors made by another provider are recomputed.</summary>
    public static string EmbeddingModel(IConfiguration configuration) =>
        IsOllamaSelected(configuration)
            ? configuration["Ollama:EmbeddingModel"] ?? "nomic-embed-text"
            : configuration["Gemini:EmbeddingModel"] ?? "gemini-embedding-001";

    // ───────────────────────────── helpers ─────────────────────────────

    /// <summary>Gemini writes schema types in capitals (OBJECT, STRING), Ollama expects lower case.</summary>
    private static JsonNode? LowerTypes(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                var copy = new JsonObject();
                foreach (var (key, value) in obj)
                    copy[key] = key == "type" && value is JsonValue tv && tv.TryGetValue<string>(out var s) ? s.ToLowerInvariant() : LowerTypes(value);
                return copy;
            case JsonArray arr:
                return new JsonArray(arr.Select(LowerTypes).ToArray());
            default:
                return node?.DeepClone();
        }
    }

    private static HttpResponseMessage Reply(HttpStatusCode status, JsonNode body) =>
        new(status) { Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json") };
}
