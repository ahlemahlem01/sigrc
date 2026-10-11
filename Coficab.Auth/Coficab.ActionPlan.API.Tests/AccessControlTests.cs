using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Endpoints that used to answer without a token, or to any signed-in user.</summary>
public class AccessControlTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public AccessControlTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string? role, string? datasetKey = null)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        if (role != null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (datasetKey != null)
            client.DefaultRequestHeaders.Add("X-Dataset-Key", datasetKey);
        return client;
    }

    [Theory]
    [InlineData("/api/Pareto")]
    [InlineData("/api/Pareto/suggest")]
    [InlineData("/api/hr-reports/generate")]
    public async Task Anonymous_IsRejected(string path)
    {
        var response = await ClientAs(TestAuthHandler.Anonymous).PostAsJsonAsync(path, new { });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task HrReports_ForbiddenForNonAdmin()
    {
        var response = await ClientAs("user").PostAsJsonAsync("/api/hr-reports/generate", new { });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Pareto_AllowedForSignedInUser()
    {
        var response = await ClientAs("user").PostAsJsonAsync("/api/Pareto", new { });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("wrong-key")]
    public async Task TrainingDataset_AnonymousWithoutValidKey_IsRejected(string? key)
    {
        var response = await ClientAs(TestAuthHandler.Anonymous, key).GetAsync("/api/ml-features/training-dataset");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task TrainingDataset_NonAdminWithoutKey_IsRejected()
    {
        var response = await ClientAs("user").GetAsync("/api/ml-features/training-dataset");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task TrainingDataset_AnonymousWithKey_IsAllowed()
    {
        var response = await ClientAs(TestAuthHandler.Anonymous, ActionPlanApiFactory.DatasetApiKey)
            .GetAsync("/api/ml-features/training-dataset");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
