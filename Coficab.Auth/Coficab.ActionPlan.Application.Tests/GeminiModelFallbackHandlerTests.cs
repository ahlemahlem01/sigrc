using System.Net;
using System.Text;
using Coficab.ActionPlan.Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Coficab.ActionPlan.Application.Tests;

public class GeminiModelFallbackHandlerTests
{
    private sealed class Scripted : HttpMessageHandler
    {
        private readonly Queue<HttpStatusCode> _answers;
        public List<(string Url, string Body)> Seen { get; } = new();
        public Scripted(params HttpStatusCode[] answers) => _answers = new Queue<HttpStatusCode>(answers);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Seen.Add((request.RequestUri!.AbsoluteUri, request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken)));
            return new HttpResponseMessage(_answers.Count > 0 ? _answers.Dequeue() : HttpStatusCode.OK);
        }
    }

    private static HttpClient Client(HttpMessageHandler inner, string? fallback = "model-b,model-c", string? attemptTimeout = null)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Gemini:FallbackModels"] = fallback,
            ["Gemini:AttemptTimeoutSeconds"] = attemptTimeout,
        }).Build();
        var handler = new GeminiModelFallbackHandler(config, NullLogger<GeminiModelFallbackHandler>.Instance) { InnerHandler = inner };
        return new HttpClient(handler);
    }

    private static Task<HttpResponseMessage> Generate(HttpClient c, string model = "model-a") =>
        c.PostAsync($"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=K",
            new StringContent("{\"contents\":[]}", Encoding.UTF8, "application/json"));

    [Fact]
    public async Task QuotaReachedOrOverloaded_MovesToTheNextModel_WithTheSameBody()
    {
        var inner = new Scripted(HttpStatusCode.TooManyRequests, HttpStatusCode.ServiceUnavailable, HttpStatusCode.OK);
        var response = await Generate(Client(inner));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(3, inner.Seen.Count);
        Assert.Contains("/models/model-a:", inner.Seen[0].Url);
        Assert.Contains("/models/model-b:", inner.Seen[1].Url);
        Assert.Contains("/models/model-c:", inner.Seen[2].Url);
        Assert.All(inner.Seen, s => Assert.Equal("{\"contents\":[]}", s.Body));
    }

    [Fact]
    public async Task ASuccessOrARefusedRequest_IsNotRetried()
    {
        var ok = new Scripted(HttpStatusCode.OK);
        Assert.Equal(HttpStatusCode.OK, (await Generate(Client(ok))).StatusCode);
        Assert.Single(ok.Seen);

        var bad = new Scripted(HttpStatusCode.BadRequest);
        Assert.Equal(HttpStatusCode.BadRequest, (await Generate(Client(bad))).StatusCode);
        Assert.Single(bad.Seen);
    }

    [Fact]
    public async Task WhenEveryModelIsBusy_TheLastAnswerIsReturned()
    {
        var inner = new Scripted(HttpStatusCode.TooManyRequests, HttpStatusCode.TooManyRequests, HttpStatusCode.ServiceUnavailable);
        var response = await Generate(Client(inner));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(3, inner.Seen.Count);
    }

    [Fact]
    public async Task WithoutFallbackModels_OrForAnotherService_NothingChanges()
    {
        var inner = new Scripted(HttpStatusCode.TooManyRequests);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Generate(Client(inner, fallback: null))).StatusCode);
        Assert.Single(inner.Seen);

        var other = new Scripted(HttpStatusCode.TooManyRequests, HttpStatusCode.OK);
        var response = await Client(other).PostAsync("https://example.test/api", new StringContent("x"));
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Single(other.Seen);
    }

    private sealed class FirstOneHangs : HttpMessageHandler
    {
        public List<string> Urls { get; } = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Urls.Add(request.RequestUri!.AbsoluteUri);
            if (Urls.Count == 1) await Task.Delay(Timeout.Infinite, cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK);
        }
    }

    [Fact]
    public async Task AModelThatDoesNotAnswerInTime_CountsAsOverloaded_AndTheNextOneIsTried()
    {
        var inner = new FirstOneHangs();
        var response = await Generate(Client(inner, attemptTimeout: "0.2"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, inner.Urls.Count);
        Assert.Contains("/models/model-b:", inner.Urls[1]);
    }

    [Fact]
    public async Task ACancellationByTheCaller_IsNotHiddenAsAnOverload()
    {
        var inner = new FirstOneHangs();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        var client = Client(inner, attemptTimeout: "30");
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.PostAsync(
            "https://generativelanguage.googleapis.com/v1beta/models/model-a:generateContent?key=K", new StringContent("{}"), cts.Token));
        Assert.Single(inner.Urls);
    }
}
