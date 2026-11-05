using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Coficab.ActionPlan.Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Coficab.ActionPlan.Application.Tests;

public class OllamaBridgeHandlerTests
{
    private sealed class Scripted : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _answer;
        public List<(string Url, string Body)> Seen { get; } = new();
        public Scripted(Func<HttpRequestMessage, HttpResponseMessage> answer) => _answer = answer;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Seen.Add((request.RequestUri!.AbsoluteUri, request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken)));
            return _answer(request);
        }
    }

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static HttpClient Client(HttpMessageHandler inner, string provider = "ollama")
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Llm:Provider"] = provider,
            ["Ollama:BaseUrl"] = "http://ollama.test:11434",
        }).Build();
        return new HttpClient(new OllamaBridgeHandler(config, NullLogger<OllamaBridgeHandler>.Instance) { InnerHandler = inner });
    }

    private static Task<HttpResponseMessage> Gemini(HttpClient c, string op, string body, string key = "ollama-local") =>
        c.PostAsync($"https://generativelanguage.googleapis.com/v1beta/models/gemini-x:{op}?key={key}",
            new StringContent(body, Encoding.UTF8, "application/json"));

    [Fact]
    public async Task OtherProvider_GoesThroughUntouched()
    {
        var inner = new Scripted(_ => Json("{}"));
        await Gemini(Client(inner, "gemini"), "generateContent", "{\"contents\":[]}");
        Assert.Contains("generativelanguage.googleapis.com", Assert.Single(inner.Seen).Url);
    }

    [Fact]
    public async Task Text_IsTranslatedToAnOllamaChatAndBack()
    {
        var inner = new Scripted(_ => Json("{\"message\":{\"role\":\"assistant\",\"content\":\"Bonjour\"}}"));
        var response = await Gemini(Client(inner), "generateContent",
            "{\"system_instruction\":{\"parts\":[{\"text\":\"Sois bref\"}]},\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"Salut\"}]}],"
            + "\"generationConfig\":{\"temperature\":0.3,\"maxOutputTokens\":99,\"responseMimeType\":\"application/json\"}}");

        var seen = Assert.Single(inner.Seen);
        Assert.Equal("http://ollama.test:11434/api/chat", seen.Url);
        var sent = JsonNode.Parse(seen.Body)!;
        Assert.Equal("qwen2.5:3b", sent["model"]!.GetValue<string>());
        Assert.Equal("system", sent["messages"]![0]!["role"]!.GetValue<string>());
        Assert.Equal("Salut", sent["messages"]![1]!["content"]!.GetValue<string>());
        Assert.Equal(99, sent["options"]!["num_predict"]!.GetValue<int>());
        Assert.Equal("json", sent["format"]!.GetValue<string>());

        var back = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("Bonjour", back["candidates"]![0]!["content"]!["parts"]![0]!["text"]!.GetValue<string>());
    }

    private const string ImageBody = "{\"contents\":[{\"parts\":[{\"text\":\"Décris\"},{\"inline_data\":{\"mime_type\":\"image/png\",\"data\":\"QUJD\"}}]}]}";

    [Fact]
    public async Task AnImage_StaysOnGemini_WhenARealKeyIsSet()
    {
        var inner = new Scripted(_ => Json("{\"candidates\":[]}"));
        await Gemini(Client(inner), "generateContent", ImageBody, key: "REAL");
        Assert.Contains("generativelanguage.googleapis.com", Assert.Single(inner.Seen).Url);
    }

    [Fact]
    public async Task TheCoach_StaysOnGemini_WhenARealKeyIsSet_AndTheMarkerIsRemoved()
    {
        var inner = new Scripted(_ => Json("{\"candidates\":[]}"));
        var client = Client(inner);
        var request = new HttpRequestMessage(HttpMethod.Post, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=REAL")
        {
            Content = new StringContent("{\"contents\":[]}", Encoding.UTF8, "application/json"),
        };
        request.Headers.Add(OllamaBridgeHandler.PurposeHeader, "coach");
        await client.SendAsync(request);

        Assert.Contains("generativelanguage.googleapis.com", Assert.Single(inner.Seen).Url);
        Assert.False(request.Headers.Contains(OllamaBridgeHandler.PurposeHeader));
    }

    [Fact]
    public async Task AnImage_SelectsTheVisionModel()
    {
        var inner = new Scripted(_ => Json("{\"message\":{\"content\":\"{}\"}}"));
        await Gemini(Client(inner), "generateContent", ImageBody);

        var sent = JsonNode.Parse(Assert.Single(inner.Seen).Body)!;
        Assert.Equal("qwen2.5vl:3b", sent["model"]!.GetValue<string>());
        Assert.Equal("QUJD", sent["messages"]![0]!["images"]![0]!.GetValue<string>());
    }

    [Fact]
    public async Task ToolsAndToolCalls_AreTranslatedBothWays()
    {
        var inner = new Scripted(_ => Json(
            "{\"message\":{\"role\":\"assistant\",\"content\":\"\",\"tool_calls\":[{\"function\":{\"name\":\"get_claims\",\"arguments\":{\"status\":\"OPEN\"}}}]}}"));
        var response = await Gemini(Client(inner), "generateContent",
            "{\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"Combien ?\"}]}],"
            + "\"tools\":[{\"functionDeclarations\":[{\"name\":\"get_claims\",\"description\":\"d\",\"parameters\":{\"type\":\"OBJECT\",\"properties\":{\"status\":{\"type\":\"STRING\"}}}}]}]}");

        var sent = JsonNode.Parse(Assert.Single(inner.Seen).Body)!;
        var fn = sent["tools"]![0]!["function"]!;
        Assert.Equal("get_claims", fn["name"]!.GetValue<string>());
        Assert.Equal("object", fn["parameters"]!["type"]!.GetValue<string>());
        Assert.Equal("string", fn["parameters"]!["properties"]!["status"]!["type"]!.GetValue<string>());

        var part = JsonNode.Parse(await response.Content.ReadAsStringAsync())!["candidates"]![0]!["content"]!["parts"]![0]!["functionCall"]!;
        Assert.Equal("get_claims", part["name"]!.GetValue<string>());
        Assert.Equal("OPEN", part["args"]!["status"]!.GetValue<string>());
    }

    [Fact]
    public async Task Embeddings_AreTranslated()
    {
        var inner = new Scripted(_ => Json("{\"embeddings\":[[0.5,0.25]]}"));
        var response = await Gemini(Client(inner), "embedContent", "{\"content\":{\"parts\":[{\"text\":\"câble\"}]}}");

        var seen = Assert.Single(inner.Seen);
        Assert.Equal("http://ollama.test:11434/api/embed", seen.Url);
        Assert.Equal("nomic-embed-text", JsonNode.Parse(seen.Body)!["model"]!.GetValue<string>());
        var values = JsonNode.Parse(await response.Content.ReadAsStringAsync())!["embedding"]!["values"]!.AsArray();
        Assert.Equal(2, values.Count);
    }

    [Fact]
    public async Task OllamaDown_FallsBackToGemini_OnlyWithARealKey()
    {
        var inner = new Scripted(r => r.RequestUri!.Host == "ollama.test"
            ? throw new HttpRequestException("refused")
            : Json("{\"candidates\":[]}"));

        var withKey = await Gemini(Client(inner), "generateContent", "{\"contents\":[]}", key: "REAL");
        Assert.Equal(HttpStatusCode.OK, withKey.StatusCode);
        Assert.Contains(inner.Seen, s => s.Url.Contains("generativelanguage.googleapis.com"));

        await Assert.ThrowsAsync<HttpRequestException>(() => Gemini(Client(inner), "generateContent", "{\"contents\":[]}"));
    }
}
