using System.Net;
using System.Net.Http.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Mandatory pagination of the claims list, and the admin-only latency metrics.</summary>
public class ClaimsPagingAndMetricsTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ClaimsPagingAndMetricsTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    [Fact]
    public async Task Claims_ArePaged_WithTotalHeaders_AndStableOrder()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            for (var i = 0; i < 5; i++)
                db.Claims.Add(new Claim
                {
                    Id = Guid.NewGuid(), Title = "paged" + i, DefectType = "Soudure", ClientId = "A", Severity = "HIGH",
                    LotNumber = "L", Description = "d", StatusCode = "PENDING", DetectionDate = DateTime.UtcNow,
                });
            await db.SaveChangesAsync();
        }

        var client = ClientAs("superadmin");
        var first = await client.GetAsync("/api/QualityAnalysis/claims?page=1&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var firstItems = await first.Content.ReadFromJsonAsync<List<Claim>>();
        Assert.Equal(2, firstItems!.Count);
        Assert.True(int.Parse(first.Headers.GetValues("X-Total-Count").First()) >= 5);
        Assert.Equal("2", first.Headers.GetValues("X-Page-Size").First());

        var second = await client.GetAsync("/api/QualityAnalysis/claims?page=2&pageSize=2");
        var secondItems = await second.Content.ReadFromJsonAsync<List<Claim>>();
        Assert.Empty(firstItems.Select(c => c.Id).Intersect(secondItems!.Select(c => c.Id)));
    }

    [Fact]
    public async Task PageSize_IsCapped()
    {
        var response = await ClientAs("superadmin").GetAsync("/api/QualityAnalysis/claims?pageSize=100000");
        Assert.Equal("500", response.Headers.GetValues("X-Page-Size").First());
    }

    [Fact]
    public async Task LatencyMetrics_AreAdminOnly()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").GetAsync("/api/metrics/latency")).StatusCode);

        await ClientAs("superadmin").GetAsync("/api/QualityAnalysis/claims");
        var response = await ClientAs("admin").GetAsync("/api/metrics/latency");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("p95Ms", await response.Content.ReadAsStringAsync());
    }
}
