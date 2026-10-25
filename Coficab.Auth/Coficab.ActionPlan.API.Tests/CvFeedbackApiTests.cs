using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Active learning: a claim records the code the image model proposed and is flagged when the operator's code differs or the proposal was unsure.</summary>
public class CvFeedbackApiTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    private readonly HttpClient _client;
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public CvFeedbackApiTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    private async Task<Claim> CreateAsync(string chosen, string? predicted, double? confidence)
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent("Réclamation image"), "Title" },
            { new StringContent("CLIENT-A"), "ClientId" },
            { new StringContent(chosen), "DefectType" },
            { new StringContent("HIGH"), "Severity" },
            { new StringContent(DateTime.UtcNow.ToString("o")), "DetectionDate" },
            { new StringContent("LOT-1"), "LotNumber" },
            { new StringContent("Description suffisamment longue pour le claim"), "Description" },
        };
        if (predicted != null) form.Add(new StringContent(predicted), "CvPredictedDefectType");
        if (confidence != null) form.Add(new StringContent(confidence.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)), "CvConfidence");

        var response = await _client.PostAsync("/api/QualityAnalysis/claims", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("id").GetGuid();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        return await db.Claims.AsNoTracking().FirstAsync(c => c.Id == id);
    }

    [Fact]
    public async Task OperatorCorrection_IsLogged_WithTheProposal()
    {
        var claim = await CreateAsync("BROKEN_STRANDS", "CUT_INSULATION", 0.91);
        Assert.True(claim.CvCorrectionLogged);
        Assert.Equal("CUT_INSULATION", claim.CvPredictedDefectType);
        Assert.Equal(0.91, claim.CvConfidence);
        Assert.Equal("BROKEN_STRANDS", claim.DefectType);   // the operator's code is the one the claim keeps
    }

    [Fact]
    public async Task ConfidentProposalAccepted_IsNotLogged()
    {
        var claim = await CreateAsync("CUT_INSULATION", "CUT_INSULATION", 0.95);
        Assert.False(claim.CvCorrectionLogged);
        Assert.Equal("CUT_INSULATION", claim.CvPredictedDefectType);
    }

    [Fact]
    public async Task ClaimWithoutPhoto_HasNoProposalAndNoFlag()
    {
        var claim = await CreateAsync("Soudure", null, null);
        Assert.False(claim.CvCorrectionLogged);
        Assert.Null(claim.CvPredictedDefectType);
        Assert.Null(claim.CvConfidence);
    }

    [Fact]
    public async Task WithoutAnImageModel_TheSuggestionEndpointSaysNothingIsAvailable()
    {
        using var form = new MultipartFormDataContent { { new ByteArrayContent(new byte[] { 1, 2, 3 }), "image", "cable.jpg" } };
        var response = await _client.PostAsync("/api/QualityAnalysis/claims/cv-suggestion", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False((await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("available").GetBoolean());
    }

    [Fact]
    public async Task TestWords_AreNeverSuggested_ButArchivedClaimsStillAre()
    {
        await _factory.SeedAsync(db =>
        {
            Claim Make(string defect, bool archived) => new()
            {
                Id = Guid.NewGuid(), Title = "t", ClientId = "C", DefectType = defect, Severity = "LOW", LotNumber = "L", Description = "d",
                StatusCode = "OUVERTE", CreatedAt = DateTime.UtcNow, IsArchived = archived,
            };
            db.Claims.AddRange(Make("test", false), Make("Test2", false), Make("Gaine rayée archivée", true));
            return Task.CompletedTask;
        });

        var lists = await _client.GetFromJsonAsync<JsonElement>("/api/reference-lists", JsonOpts);
        var suggestions = lists.GetProperty("defectTypeSuggestions").EnumerateArray().Select(e => e.GetString()!).ToList();
        Assert.DoesNotContain(suggestions, s => s.StartsWith("test", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("Gaine rayée archivée", suggestions);
    }
}
