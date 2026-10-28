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

    private sealed class ImageServiceStub(string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") });
    }

    private async Task<JsonElement> SuggestWithServiceAnswer(string serviceJson)
    {
        var factory = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("ComputerVision:ServiceUrl", "http://cv.test");
            b.ConfigureServices(s => s.AddHttpClient(string.Empty).ConfigurePrimaryHttpMessageHandler(() => new ImageServiceStub(serviceJson)));
        });
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var form = new MultipartFormDataContent { { new ByteArrayContent(new byte[] { 1, 2, 3 }), "image", "cable.jpg" } };
        var response = await client.PostAsync("/api/QualityAnalysis/claims/cv-suggestion", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
    }

    private const string SimilarJson = """
        "similar_cases":[{"id_reclamation":"abc","photo_url":"data:image/jpeg;base64,xx","code_defaut":"CUT_INSULATION","libelle_defaut":"Isolant coupé",
        "score_similarite":81.2,"source":"claim","reference":"REC-2026-1383","severite":"HIGH"}]
        """;

    [Theory]
    [InlineData("""{"defectType":"CUT_INSULATION","confidence":0.5,""" + SimilarJson + "}", true)]     // unsure proposal
    [InlineData("""{"defectType":null,"confidence":0,""" + SimilarJson + "}", false)]                  // nothing recognised
    public async Task SimilarCases_AreRelayedWithTheNamesOfTheServiceContract(string serviceJson, bool available)
    {
        var answer = await SuggestWithServiceAnswer(serviceJson);
        Assert.Equal(available, answer.GetProperty("available").GetBoolean());
        var first = answer.GetProperty("similar_cases")[0];
        Assert.Equal("abc", first.GetProperty("id_reclamation").GetString());
        Assert.Equal("data:image/jpeg;base64,xx", first.GetProperty("photo_url").GetString());
        Assert.Equal("CUT_INSULATION", first.GetProperty("code_defaut").GetString());
        Assert.Equal("Isolant coupé", first.GetProperty("libelle_defaut").GetString());
        Assert.Equal(81.2, first.GetProperty("score_similarite").GetDouble());
        Assert.Equal("claim", first.GetProperty("source").GetString());
        Assert.Equal("REC-2026-1383", first.GetProperty("reference").GetString());
        Assert.Equal("HIGH", first.GetProperty("severite").GetString());
    }

    [Fact]
    public async Task ConfidentAnswer_RelaysAnEmptySimilarList()
    {
        var answer = await SuggestWithServiceAnswer("""{"defectType":"CUT_INSULATION","confidence":0.93}""");
        Assert.True(answer.GetProperty("available").GetBoolean());
        Assert.Equal(0, answer.GetProperty("similar_cases").GetArrayLength());
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

    private static Claim WithPhoto(string defect, string? predicted, double? confidence, bool logged, string contentType = "image/jpeg") => new()
    {
        Id = Guid.NewGuid(), Title = "photo", ClientId = "C", DefectType = defect, Severity = "LOW", LotNumber = "L", Description = "d", StatusCode = "OUVERTE",
        CreatedAt = DateTime.UtcNow, AttachmentName = "p.jpg", AttachmentContentType = contentType, AttachmentData = new byte[] { 1, 2, 3, 4 },
        CvPredictedDefectType = predicted, CvConfidence = confidence, CvCorrectionLogged = logged,
    };

    [Fact]
    public async Task CvCorrections_ListOnlyThePhotosThatTeachTheModel_AndServeTheirBytes()
    {
        var corrected = WithPhoto("CUT_INSULATION", "SCRATCH_INSULATION", 0.92, logged: true);
        var unsure = WithPhoto("SCRATCH_INSULATION", "SCRATCH_INSULATION", 0.55, logged: false);
        var confidentAndRight = WithPhoto("FOREIGN_MATTER", "FOREIGN_MATTER", 0.95, logged: false);
        var noProposal = WithPhoto("CUT_INSULATION", null, null, logged: false);
        var notAnImage = WithPhoto("CUT_INSULATION", "SCRATCH_INSULATION", 0.9, logged: true, contentType: "application/pdf");
        await _factory.SeedAsync(db => { db.Claims.AddRange(corrected, unsure, confidentAndRight, noProposal, notAnImage); return Task.CompletedTask; });

        var list = await _client.GetFromJsonAsync<JsonElement>("/api/ml-features/cv-corrections?status=all", JsonOpts);
        var ids = list.GetProperty("items").EnumerateArray().Select(e => e.GetProperty("claimId").GetGuid()).ToList();
        Assert.Contains(corrected.Id, ids);
        Assert.Contains(unsure.Id, ids);
        Assert.DoesNotContain(confidentAndRight.Id, ids);
        Assert.DoesNotContain(noProposal.Id, ids);
        Assert.DoesNotContain(notAnImage.Id, ids);
        var row = list.GetProperty("items").EnumerateArray().First(e => e.GetProperty("claimId").GetGuid() == corrected.Id);
        Assert.Equal("CUT_INSULATION", row.GetProperty("defectType").GetString());               // the code the operator kept
        Assert.Equal("SCRATCH_INSULATION", row.GetProperty("predictedDefectType").GetString());

        var photo = await _client.GetAsync($"/api/ml-features/cv-corrections/{corrected.Id}/photo");
        Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
        Assert.Equal(new byte[] { 1, 2, 3, 4 }, await photo.Content.ReadAsByteArrayAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/ml-features/cv-corrections/{notAnImage.Id}/photo")).StatusCode);
    }

    [Fact]
    public async Task OnlyPhotosValidatedByTheEngineer_TrainTheModel_WithTheCodeGivenByTheEngineer()
    {
        var pending = WithPhoto("CUT_INSULATION", "SCRATCH_INSULATION", 0.9, logged: true);
        var validated = WithPhoto("CUT_INSULATION", "SCRATCH_INSULATION", 0.9, logged: true);
        var rejected = WithPhoto("CUT_INSULATION", "SCRATCH_INSULATION", 0.9, logged: true);
        await _factory.SeedAsync(db => { db.Claims.AddRange(pending, validated, rejected); return Task.CompletedTask; });

        async Task<HttpStatusCode> Decide(Guid id, object body) => (await _client.PutAsJsonAsync($"/api/ml-features/cv-corrections/{id}/validation", body)).StatusCode;
        Assert.Equal(HttpStatusCode.OK, await Decide(validated.Id, new { status = "VALIDATED", defectType = "SCRATCH_INSULATION" }));   // the engineer changes the code
        Assert.Equal(HttpStatusCode.OK, await Decide(rejected.Id, new { status = "REJECTED" }));
        Assert.Equal(HttpStatusCode.BadRequest, await Decide(pending.Id, new { status = "MAYBE" }));
        Assert.Equal(HttpStatusCode.NotFound, await Decide(Guid.NewGuid(), new { status = "VALIDATED" }));

        async Task<List<JsonElement>> Rows(string status) =>
            (await _client.GetFromJsonAsync<JsonElement>($"/api/ml-features/cv-corrections?status={status}", JsonOpts)).GetProperty("items").EnumerateArray().ToList();
        bool Has(List<JsonElement> rows, Guid id) => rows.Any(r => r.GetProperty("claimId").GetGuid() == id);

        var defaultList = (await _client.GetFromJsonAsync<JsonElement>("/api/ml-features/cv-corrections", JsonOpts)).GetProperty("items").EnumerateArray().ToList();
        Assert.True(Has(defaultList, validated.Id));                                                // what trains the model is the default answer
        Assert.False(Has(defaultList, pending.Id) || Has(defaultList, rejected.Id));
        Assert.Equal("SCRATCH_INSULATION", defaultList.First(r => r.GetProperty("claimId").GetGuid() == validated.Id).GetProperty("defectType").GetString());
        Assert.True(Has(await Rows("pending"), pending.Id));
        Assert.True(Has(await Rows("rejected"), rejected.Id));
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.GetAsync("/api/ml-features/cv-corrections?status=bogus")).StatusCode);
    }

    [Fact]
    public async Task OnlyAnAdmin_CanValidate()
    {
        var claim = WithPhoto("CUT_INSULATION", "SCRATCH_INSULATION", 0.9, logged: true);
        await _factory.SeedAsync(db => { db.Claims.Add(claim); return Task.CompletedTask; });
        using var employee = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        employee.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "employee");
        var response = await employee.PutAsJsonAsync($"/api/ml-features/cv-corrections/{claim.Id}/validation", new { status = "VALIDATED" });
        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task CvCorrections_RefuseSomeoneWithoutTheKeyOrAnAdminToken()
    {
        using var anonymous = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        anonymous.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, TestAuthHandler.Anonymous);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/ml-features/cv-corrections")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/ml-features/cv-corrections/{Guid.NewGuid()}/photo")).StatusCode);
    }
}
