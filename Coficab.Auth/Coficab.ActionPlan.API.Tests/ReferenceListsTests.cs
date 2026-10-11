using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Multi-industry reference lists: defect types and severity wording.</summary>
public class ReferenceListsTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public ReferenceListsTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        // Creates the in-memory database, which also loads the default lists (seed data of the model).
        _factory.SeedAsync(_ => Task.CompletedTask).GetAwaiter().GetResult();
    }

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private static async Task<JsonElement> Lists(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("lists");
    }

    [Fact]
    public async Task SeverityLevels_AreSeeded_AndDefectTypesStartEmpty()
    {
        var lists = await Lists(await ClientAs("user").GetAsync("/api/reference-lists"));
        Assert.Equal(4, lists.GetProperty("severity").GetArrayLength());
        Assert.True(lists.TryGetProperty("defect-type", out _));
    }

    [Fact]
    public async Task OnlyAdmins_CanEdit()
    {
        var body = new { items = new[] { new { value = "Fuite", label = "Fuite", sortOrder = 1, isActive = true } } };
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PutAsJsonAsync("/api/reference-lists/defect-type", body)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("admin").PutAsJsonAsync("/api/reference-lists/defect-type", body)).StatusCode);
    }

    [Fact]
    public async Task DefectType_CanBeAdded_Reordered_AndDeactivatedWithoutDeletion()
    {
        var client = ClientAs("admin");
        await client.PutAsJsonAsync("/api/reference-lists/defect-type",
            new { items = new[] { new { value = "Corrosion", label = "Corrosion", sortOrder = 1, isActive = true } } });
        var after = await Lists(await client.PutAsJsonAsync("/api/reference-lists/defect-type",
            new { items = new[] { new { value = "corrosion", label = "Corrosion de surface", sortOrder = 2, isActive = false } } }));

        var items = after.GetProperty("defect-type").EnumerateArray().Where(e => e.GetProperty("value").GetString()!.ToLower() == "corrosion").ToList();
        Assert.Single(items); // same value (any case) updates the entry instead of duplicating it
        Assert.Equal(JsonValueKind.Null, items[0].GetProperty("label").ValueKind); // no display label for defect types
        Assert.False(items[0].GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task SeverityLevels_AreFixed_AndAtLeastOneStaysActive()
    {
        var client = ClientAs("admin");

        var unknown = new { items = new[] { new { value = "EXTREME", label = "Extrême", sortOrder = 5, isActive = true } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/reference-lists/severity", unknown)).StatusCode);

        var renamed = new { items = new[] { new { value = "critical", label = "Arrêt de ligne", sortOrder = 4, isActive = true } } };
        var lists = await Lists(await client.PutAsJsonAsync("/api/reference-lists/severity", renamed));
        Assert.Contains(lists.GetProperty("severity").EnumerateArray(),
            e => e.GetProperty("value").GetString() == "CRITICAL" && e.GetProperty("label").GetString() == "Arrêt de ligne");

        var allOff = new
        {
            items = new[] { "LOW", "MEDIUM", "HIGH", "CRITICAL" }.Select((v, i) => new { value = v, label = (string?)null, sortOrder = i + 1, isActive = false }).ToArray(),
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/reference-lists/severity", allOff)).StatusCode);
    }

    [Fact]
    public async Task UnknownList_IsRejected()
    {
        var body = new { items = new[] { new { value = "x", label = "x", sortOrder = 1, isActive = true } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await ClientAs("admin").PutAsJsonAsync("/api/reference-lists/colors", body)).StatusCode);
    }

    [Fact]
    public async Task ImportExisting_AddsTheDefectTypesAlreadyUsed_OnceOnly()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(), Title = "t", DefectType = "Isolation endommagée", ClientId = "A", Severity = "HIGH",
                LotNumber = "L", Description = "d", StatusCode = "OUVERTE", DetectionDate = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var client = ClientAs("admin");
        await client.PostAsync("/api/reference-lists/defect-type/import-existing", null);
        var lists = await Lists(await client.PostAsync("/api/reference-lists/defect-type/import-existing", null));

        Assert.Single(lists.GetProperty("defect-type").EnumerateArray(), e => e.GetProperty("value").GetString() == "Isolation endommagée");
    }
}
