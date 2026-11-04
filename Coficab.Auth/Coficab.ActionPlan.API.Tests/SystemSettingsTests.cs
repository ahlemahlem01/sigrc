using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.Licences;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The automatic logout delay (local administrator) and the licences (superadmin) of the specification.</summary>
public class SystemSettingsTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public SystemSettingsTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _factory.SeedAsync(_ => Task.CompletedTask).GetAwaiter().GetResult();
    }

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task TheLogoutDelay_IsSetByAnAdministrator_AndRefusedWhenOutOfRange()
    {
        var admin = ClientAs("admin");
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/system/session", new { idleMinutes = 20 })).StatusCode);
        Assert.Equal(20, (await Json(await ClientAs("user").GetAsync("/api/system/session"))).GetProperty("idleMinutes").GetInt32());

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/system/session", new { idleMinutes = 2 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/system/session", new { idleMinutes = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PutAsJsonAsync("/api/system/session", new { idleMinutes = 10 })).StatusCode);
    }

    [Fact]
    public async Task OnlyTheSuperadminRecordsLicences_TheLicenceStateIsPublic_AndNothingIsDeleted()
    {
        var body = new { key = "LIC-TEST-1", isGlobal = true, maxUsers = 50, expiresAt = DateTime.UtcNow.AddDays(10) };

        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("admin").PostAsJsonAsync("/api/system/licences", body)).StatusCode);
        var created = await Json(await ClientAs("superadmin").PostAsJsonAsync("/api/system/licences", body));
        var id = created.GetProperty("id").GetGuid();

        var anonymous = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        anonymous.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, TestAuthHandler.Anonymous);
        var publicState = await Json(await anonymous.GetAsync("/api/system/public"));
        Assert.Equal("expiring", publicState.GetProperty("licence").GetProperty("state").GetString());

        var listed = await Json(await ClientAs("admin").GetAsync("/api/system/licences"));
        Assert.Contains(listed.GetProperty("items").EnumerateArray(), l => l.GetProperty("id").GetGuid() == id);
        Assert.Equal(HttpStatusCode.BadRequest, (await ClientAs("superadmin").PostAsJsonAsync("/api/system/licences", new { key = "", isGlobal = true, maxUsers = 5, expiresAt = DateTime.UtcNow })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await ClientAs("superadmin").DeleteAsync($"/api/system/licences/{id}")).StatusCode);
        var after = await Json(await ClientAs("admin").GetAsync("/api/system/licences"));
        Assert.DoesNotContain(after.GetProperty("items").EnumerateArray(), l => l.GetProperty("id").GetGuid() == id);
    }

    [Fact]
    public void TheLicenceState_FollowsTheMostUrgentLicence()
    {
        var now = new DateTime(2026, 11, 4, 12, 0, 0, DateTimeKind.Utc);
        Licence L(int days, bool global = true, int max = 10, bool archived = false) => new() { Key = "k", IsGlobal = global, MaxUsers = max, ExpiresAt = now.AddDays(days), IsArchived = archived };

        Assert.Equal("none", LicenceStatus.Compute(Array.Empty<Licence>(), now).State);
        Assert.Equal("ok", LicenceStatus.Compute(new[] { L(200) }, now).State);
        Assert.Equal("expiring", LicenceStatus.Compute(new[] { L(200), L(12, false) }, now).State);
        Assert.Equal("expired", LicenceStatus.Compute(new[] { L(-1) }, now).State);
        Assert.Equal("ok", LicenceStatus.Compute(new[] { L(200), L(-5, archived: true) }, now).State);

        Assert.Null(LicenceStatus.MaxUsers(Array.Empty<Licence>()));
        Assert.Equal(40, LicenceStatus.MaxUsers(new[] { L(100, global: true, max: 40), L(100, global: false, max: 5) }));
        Assert.Equal(12, LicenceStatus.MaxUsers(new[] { L(100, global: false, max: 5), L(100, global: false, max: 7) }));
    }
}
