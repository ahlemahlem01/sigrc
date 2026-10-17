using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Regions, countries and sites follow the organization type; the type itself is the superadmin's to set.</summary>
public class OrganizationStructureTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly ActionPlanApiFactory _factory;

    public OrganizationStructureTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> OrgAsync(OrganizationType type)
    {
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = id, Name = $"Org-{id:N}"[..12], Type = type });
            return Task.CompletedTask;
        });
        return id;
    }

    private static string Url(Guid org, string tail = "") => $"/api/organization/{org}/structure{tail}";

    private static async Task<string?> CodeOf(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("code").GetString();

    [Fact]
    public async Task OnlyTheSuperadminCreatesOrganizationsOrChangesTheirType()
    {
        var org = await OrgAsync(OrganizationType.Local);

        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("admin").PostAsJsonAsync("/api/Organization", new { name = "New", type = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("admin").PutAsJsonAsync($"/api/Organization/{org}", new { name = "Renamed", type = 2 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("admin").PutAsJsonAsync($"/api/Organization/{org}", new { name = "Renamed", type = 1 })).StatusCode);   // same type: a rename is fine
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("superadmin").PutAsJsonAsync($"/api/Organization/{org}", new { name = "Renamed", type = 2 })).StatusCode);
    }

    [Fact]
    public async Task EachTypeAllowsOnlyItsOwnLevels()
    {
        var admin = ClientAs("admin");

        var local = await OrgAsync(OrganizationType.Local);
        Assert.Equal("regions_not_allowed", await CodeOf(await admin.PostAsJsonAsync(Url(local, "/regions"), new { name = "R", code = "R1" })));
        Assert.Equal("countries_not_allowed", await CodeOf(await admin.PostAsJsonAsync(Url(local, "/countries"), new { name = "C", code = "C1" })));
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync(Url(local, "/sites"), new { name = "Usine", code = "S1" })).StatusCode);
        var second = await admin.PostAsJsonAsync(Url(local, "/sites"), new { name = "Autre", code = "S2" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);                              // a Local organization is a single site

        var countryOnly = await OrgAsync(OrganizationType.CountryCorporate);
        Assert.Equal("regions_not_allowed", await CodeOf(await admin.PostAsJsonAsync(Url(countryOnly, "/regions"), new { name = "R", code = "R1" })));
        Assert.Equal("country_required", await CodeOf(await admin.PostAsJsonAsync(Url(countryOnly, "/sites"), new { name = "Usine", code = "S1" })));
        var country = await (await admin.PostAsJsonAsync(Url(countryOnly, "/countries"), new { name = "Tunisie", code = "tn" })).Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        Assert.Equal("TN", country.GetProperty("code").GetString());                           // codes are upper-cased
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync(Url(countryOnly, "/sites"),
            new { name = "Mateur", code = "MAT", parentId = country.GetProperty("id").GetGuid() })).StatusCode);
        Assert.Equal("code_taken", await CodeOf(await admin.PostAsJsonAsync(Url(countryOnly, "/countries"), new { name = "Autre", code = "TN" })));

        var full = await OrgAsync(OrganizationType.CountryRegionalCorporate);
        Assert.Equal("region_required", await CodeOf(await admin.PostAsJsonAsync(Url(full, "/countries"), new { name = "Portugal", code = "PT" })));
        var region = await (await admin.PostAsJsonAsync(Url(full, "/regions"), new { name = "Europe", code = "EU" })).Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync(Url(full, "/countries"),
            new { name = "Portugal", code = "PT", parentId = region.GetProperty("id").GetGuid() })).StatusCode);

        var structure = await admin.GetFromJsonAsync<JsonElement>(Url(full), JsonOpts);
        Assert.True(structure.GetProperty("hasRegions").GetBoolean());
        Assert.True(structure.GetProperty("hasCountries").GetBoolean());
        Assert.Equal(1, structure.GetProperty("regions").GetArrayLength());
    }

    [Fact]
    public async Task ChangingTheTypeIsRefusedWhileTheStructureWouldNotFit()
    {
        var org = await OrgAsync(OrganizationType.CountryCorporate);
        var admin = ClientAs("admin");
        await admin.PostAsJsonAsync(Url(org, "/countries"), new { name = "Tunisie", code = "TN" });

        var response = await ClientAs("superadmin").PutAsJsonAsync($"/api/Organization/{org}", new { name = "Org", type = 2 });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        Assert.Equal("type_conflict", body.GetProperty("code").GetString());
        Assert.Equal("countries_not_allowed", body.GetProperty("conflicts")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task ArchivingIsRefusedWhileSomethingDependsOnTheNode_ThenKeepsTheRow()
    {
        var org = await OrgAsync(OrganizationType.CountryCorporate);
        var admin = ClientAs("admin");
        var country = await (await admin.PostAsJsonAsync(Url(org, "/countries"), new { name = "Tunisie", code = "TN" })).Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        var countryId = country.GetProperty("id").GetGuid();
        var site = await (await admin.PostAsJsonAsync(Url(org, "/sites"), new { name = "Mateur", code = "MAT", parentId = countryId })).Content.ReadFromJsonAsync<JsonElement>(JsonOpts);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync(Url(org, $"/countries/{countryId}"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync(Url(org, $"/sites/{site.GetProperty("id").GetGuid()}"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync(Url(org, $"/countries/{countryId}"))).StatusCode);

        Assert.Equal(0, (await admin.GetFromJsonAsync<JsonElement>(Url(org), JsonOpts)).GetProperty("countries").GetArrayLength());
        await _factory.SeedAsync(db =>
        {
            Assert.True(db.Countries.IgnoreQueryFilters().Any(c => c.Id == countryId && c.IsArchived));   // archived, never deleted
            return Task.CompletedTask;
        });
    }

    [Fact]
    public async Task ReadingTheStructureNeedsASession_ButWritingNeedsAnAdmin()
    {
        var org = await OrgAsync(OrganizationType.Local);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ClientAs(TestAuthHandler.Anonymous).GetAsync(Url(org))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("user").GetAsync(Url(org))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PostAsJsonAsync(Url(org, "/sites"), new { name = "X", code = "X" })).StatusCode);
    }

    [Fact]
    public async Task ADepartmentIsAttachedOnlyToASiteOfItsOwnOrganization()
    {
        var mine = await OrgAsync(OrganizationType.Corporate);
        var other = await OrgAsync(OrganizationType.Corporate);
        var admin = ClientAs("admin");
        var site = (await (await admin.PostAsJsonAsync(Url(mine, "/sites"), new { name = "Mateur", code = "MAT" })).Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("id").GetGuid();
        var foreign = (await (await admin.PostAsJsonAsync(Url(other, "/sites"), new { name = "Ailleurs", code = "AIL" })).Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("id").GetGuid();

        var created = await admin.PostAsJsonAsync("/api/Department", new { name = "Qualite", code = "QA", organizationId = mine, siteId = site });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("id").GetGuid();

        var refused = await admin.PutAsJsonAsync($"/api/Department/{id}", new { name = "Qualite", code = "QA", siteId = foreign });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("site_not_in_organization", await CodeOf(refused));

        var detached = await admin.PutAsJsonAsync($"/api/Department/{id}", new { name = "Qualite", code = "QA", siteId = (Guid?)null });
        Assert.Equal(HttpStatusCode.OK, detached.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await detached.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("siteId").ValueKind);
    }
}
