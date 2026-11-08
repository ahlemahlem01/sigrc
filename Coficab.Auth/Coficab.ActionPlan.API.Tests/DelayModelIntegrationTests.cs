using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A new claim gets the validated model's estimate when the ML service answers, and the empirical percentiles otherwise.</summary>
public class DelayModelIntegrationTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public DelayModelIntegrationTests(ActionPlanApiFactory factory) => _factory = factory;

    private sealed class FakeDelayModel : IDelayModelClient
    {
        private readonly DelayModelEstimate? _answer;
        public ClaimEstimateContext? Seen { get; private set; }
        public FakeDelayModel(DelayModelEstimate? answer) => _answer = answer;
        public Task<DelayModelEstimate?> TryEstimateAsync(string? defectType, string? severity, ClaimEstimateContext context, CancellationToken cancellationToken = default)
        {
            Seen = context;
            return Task.FromResult(_answer);
        }
    }

    private async Task<(Claim claim, FakeDelayModel model)> CreateClaimAsync(DelayModelEstimate? answer)
    {
        var fake = new FakeDelayModel(answer);
        var factory = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
        {
            s.RemoveAll<IDelayModelClient>();
            s.AddSingleton<IDelayModelClient>(fake);
        }));
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        // one closed claim so that the percentiles have a history
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(), Title = "historique", ClientId = "C", DefectType = "Soudure", Severity = "HIGH", LotNumber = "L", Description = "d",
                StatusCode = "CLOTUREE", DetectionDate = DateTime.UtcNow.AddDays(-30), CreatedAt = DateTime.UtcNow.AddDays(-20), CompletedAt = DateTime.UtcNow.AddDays(-10),
            });
            await db.SaveChangesAsync();
        }

        using var form = new MultipartFormDataContent
        {
            { new StringContent("Réclamation modèle de délai"), "Title" },
            { new StringContent("CLIENT-A"), "ClientId" },
            { new StringContent("Soudure"), "DefectType" },
            { new StringContent("HIGH"), "Severity" },
            { new StringContent(DateTime.UtcNow.ToString("o")), "DetectionDate" },
            { new StringContent("LOT-1"), "LotNumber" },
            { new StringContent("Description suffisamment longue pour le claim"), "Description" },
            { new StringContent("WR-02"), "ProductionLine" },
            { new StringContent("1000"), "ProducedQuantity" },
            { new StringContent("12"), "DefectiveQuantity" },
        };
        var response = await client.PostAsync("/api/QualityAnalysis/claims", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        using var scope2 = factory.Services.CreateScope();
        var claim = await scope2.ServiceProvider.GetRequiredService<ActionPlanDbContext>().Claims.AsNoTracking().FirstAsync(c => c.Id == id);
        return (claim, fake);
    }

    [Fact]
    public async Task WhenTheValidatedModelAnswers_TheNewClaimStoresItsEstimate_WithTheCreationContext()
    {
        var (claim, model) = await CreateClaimAsync(new DelayModelEstimate(9.5, 14.2, 12540));
        Assert.Equal("ml", claim.EstimateMethod);
        Assert.Equal(9.5, claim.EstimatedDaysP50);
        Assert.Equal(14.2, claim.EstimatedDaysP80);
        Assert.Equal(12540, claim.EstimateSampleSize);
        Assert.Equal("CLIENT-A", model.Seen!.ClientId);
        Assert.Equal("WR-02", model.Seen.ProductionLine);
        Assert.Equal(1000, model.Seen.ProducedQuantity);
        Assert.Equal(12, model.Seen.DefectiveQuantity);
    }

    [Fact]
    public async Task WhenTheModelHasNoAnswer_ThePercentilesAreStored()
    {
        var (claim, _) = await CreateClaimAsync(null);
        Assert.NotEqual("ml", claim.EstimateMethod);
        Assert.NotNull(claim.EstimatedDaysP80);
    }
}
