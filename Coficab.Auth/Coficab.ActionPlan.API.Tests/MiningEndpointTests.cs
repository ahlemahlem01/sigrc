using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

public class MiningEndpointTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public MiningEndpointTests(ActionPlanApiFactory factory) => _factory = factory;

    private sealed class StubHandler : HttpMessageHandler
    {
        public string? LastBody;
        public bool Fail;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (Fail) throw new HttpRequestException("ml down");
            LastBody = request.Content == null ? null : await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"meta\":{\"dossiers\":0},\"rules\":[]}", Encoding.UTF8, "application/json"),
            };
        }
    }

    private HttpClient ClientAs(string role, StubHandler stub)
    {
        var factory = _factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
            services.AddHttpClient(string.Empty).ConfigurePrimaryHttpMessageHandler(() => stub)));
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> AddClaim(string? createdBy, string status = "CLOTUREE", bool archived = false)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var id = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = id, Title = "Secret title " + id, DefectType = "Soudure", ProductionLine = "WR-04", ClientId = "A",
            Severity = "HIGH", LotNumber = "L", Description = "d", StatusCode = status, CreatedById = createdBy,
            DetectionDate = new DateTime(2024, 5, 1, 0, 0, 0, DateTimeKind.Utc), IsArchived = archived,
        });
        await db.SaveChangesAsync();
        return id;
    }

    [Fact]
    public async Task Admin_SendsUnrestricted_History_IncludingArchivedClosedClaims()
    {
        var archived = await AddClaim(null, archived: true);
        var stub = new StubHandler();

        var response = await ClientAs("admin", stub).PostAsJsonAsync("/api/mining/insights", new { defectType = "Soudure" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(json.RootElement.GetProperty("available").GetBoolean());
        Assert.Contains("\"restricted\":false", stub.LastBody);
        Assert.Contains(archived.ToString(), stub.LastBody);
    }

    [Fact]
    public async Task Employee_IsMarkedRestricted_ForTheMlService()
    {
        var stub = new StubHandler();

        var response = await ClientAs("user", stub).PostAsJsonAsync("/api/mining/insights", new { defectType = "Soudure" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"restricted\":true", stub.LastBody);
    }

    [Fact]
    public async Task Employee_CannotMineAroundSomeoneElsesClaim()
    {
        var others = await AddClaim("someone-else", status: "EN_ANALYSE");

        var response = await ClientAs("user", new StubHandler()).PostAsJsonAsync("/api/mining/insights", new { claimId = others });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task OpenClaims_AreNotPartOfTheHistory()
    {
        var open = await AddClaim(null, status: "EN_ANALYSE");
        var stub = new StubHandler();

        await ClientAs("admin", stub).PostAsJsonAsync("/api/mining/insights", new { defectType = "Soudure" });

        Assert.DoesNotContain(open.ToString(), stub.LastBody);
    }

    [Fact]
    public async Task TheClaimsOwnIshikawaCauses_AreSentAsCandidates()
    {
        var claimId = await AddClaim(null, status: "EN_ANALYSE");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            db.IshikawaCauses.Add(new IshikawaCause { Id = Guid.NewGuid(), ClaimId = claimId, Category = IshikawaCategory.Machine, CauseDescription = "Usure des électrodes", CreatedBy = "t" });
            await db.SaveChangesAsync();
        }
        var stub = new StubHandler();

        await ClientAs("admin", stub).PostAsJsonAsync("/api/mining/insights", new { claimId });

        Assert.Contains("\"causeCandidates\"", stub.LastBody);
        Assert.Contains("Usure des", stub.LastBody);
        Assert.Contains("\"category\":\"Machine\"", stub.LastBody);
    }

    [Fact]
    public async Task WhenTheMlServiceIsDown_TheAnswerSaysSo_NotAnError()
    {
        var response = await ClientAs("admin", new StubHandler { Fail = true }).PostAsJsonAsync("/api/mining/insights", new { });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(json.RootElement.GetProperty("available").GetBoolean());
        Assert.Equal("ml_unavailable", json.RootElement.GetProperty("reason").GetString());
    }
}
