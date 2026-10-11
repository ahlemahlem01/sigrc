using System.Net;
using System.Net.Http.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>
/// Access and validation of the priority cause (who may read and write it, and which values are accepted).
/// The append-only history is covered by EfTablesTests.
/// </summary>
public class PriorityCauseTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private readonly ActionPlanApiFactory _factory;
    public PriorityCauseTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim(string? createdBy, string status = "EN_ANALYSE")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = "t", DefectType = "Soudure", ClientId = "A", Severity = "HIGH", LotNumber = "L",
            Description = "d", StatusCode = status, CreatedById = createdBy, DetectionDate = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
        return id;
    }

    [Fact]
    public async Task UnknownClaim_IsNotFound()
    {
        var response = await ClientAs("admin").PostAsJsonAsync($"/api/priority-cause/{Guid.NewGuid()}", new { text = "x" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Employee_CannotTouchSomeoneElsesClaim()
    {
        var others = await AddClaim("someone-else");
        var client = ClientAs("user");

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/priority-cause/{others}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/priority-cause/{others}", new { text = "x" })).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task EmptyCause_IsRejected(string text)
    {
        var mine = await AddClaim(Me);
        var response = await ClientAs("user").PostAsJsonAsync($"/api/priority-cause/{mine}", new { text });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task TooLongCause_AndUnknownCategory_AreRejected()
    {
        var mine = await AddClaim(Me);
        var client = ClientAs("user");

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync($"/api/priority-cause/{mine}", new { text = new string('x', 501) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync($"/api/priority-cause/{mine}", new { text = "ok", category = "Inconnue" })).StatusCode);
    }
}
