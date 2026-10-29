using System.Net;
using System.Net.Http.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The two quantities behind the PPM of the 5 Why page: saved as a coherent pair, never a defective count above the produced one.</summary>
public class ClaimQuantitiesTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ClaimQuantitiesTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient Client()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "superadmin");
        return client;
    }

    private async Task<Guid> SeedClaimAsync(int? produced, int? defective)
    {
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = id, Title = "ppm", DefectType = "Soudure", ClientId = "A", Severity = "LOW", LotNumber = "L", Description = "d",
                StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow, ProducedQuantity = produced, DefectiveQuantity = defective,
            });
            return Task.CompletedTask;
        });
        return id;
    }

    private (int? Produced, int? Defective) Stored(Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        var claim = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>().Claims.Single(c => c.Id == id);
        return (claim.ProducedQuantity, claim.DefectiveQuantity);
    }

    [Fact]
    public async Task ACoherentPairIsSaved()
    {
        var id = await SeedClaimAsync(null, null);
        var response = await Client().PutAsJsonAsync($"/api/QualityAnalysis/claims/{id}", new { id, producedQuantity = 10000, defectiveQuantity = 25 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal((10000, 25), Stored(id));
    }

    [Fact]
    public async Task MoreDefectiveThanProduced_IsRefused_EvenWhenOnlyOneValueIsSent()
    {
        var id = await SeedClaimAsync(100, 5);

        var both = await Client().PutAsJsonAsync($"/api/QualityAnalysis/claims/{id}", new { id, producedQuantity = 10, defectiveQuantity = 11 });
        Assert.Equal(HttpStatusCode.BadRequest, both.StatusCode);

        // only the produced quantity is lowered below the stored defective one
        var lone = await Client().PutAsJsonAsync($"/api/QualityAnalysis/claims/{id}", new { id, producedQuantity = 3 });
        Assert.Equal(HttpStatusCode.BadRequest, lone.StatusCode);

        Assert.Equal((100, 5), Stored(id));          // nothing was changed
    }
}
