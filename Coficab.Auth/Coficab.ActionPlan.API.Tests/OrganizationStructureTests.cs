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

    [Fact]
    public async Task ADepartmentNameAndCodeAreUsedOnlyOncePerOrganization()
    {
        var mine = await OrgAsync(OrganizationType.Corporate);
        var other = await OrgAsync(OrganizationType.Corporate);
        var admin = ClientAs("admin");

        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/Department", new { name = "Qualité", code = "qa", organizationId = mine })).StatusCode);

        var sameName = await admin.PostAsJsonAsync("/api/Department", new { name = "  QUALITE ", code = "QX", organizationId = mine });
        Assert.Equal(HttpStatusCode.Conflict, sameName.StatusCode);                               // accents, case and spacing do not make a new department
        Assert.Equal("department_name_taken", await CodeOf(sameName));

        var sameCode = await admin.PostAsJsonAsync("/api/Department", new { name = "Qualité produit", code = "QA", organizationId = mine });
        Assert.Equal("department_code_taken", await CodeOf(sameCode));

        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/Department", new { name = "Qualité", code = "QA", organizationId = other })).StatusCode);   // another organization is free to use it

        var production = await admin.PostAsJsonAsync("/api/Department", new { name = "Production", code = "PROD", organizationId = mine });
        var id = (await production.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("id").GetGuid();
        var rename = await admin.PutAsJsonAsync($"/api/Department/{id}", new { name = "qualite", code = "PROD" });
        Assert.Equal("department_name_taken", await CodeOf(rename));
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/Department/{id}", new { name = "Production", code = "prod" })).StatusCode);   // keeping its own name and code is fine
    }

    [Fact]
    public async Task TheClaimAndPlanLists_FollowTheOrganizationsChosenBySuperadmin()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        var orgA = await OrgAsync(OrganizationType.Corporate);
        var orgB = await OrgAsync(OrganizationType.Corporate);
        var deptA = Guid.NewGuid();
        var deptB = Guid.NewGuid();
        var alice = Guid.NewGuid().ToString();
        var bob = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            var now = DateTime.UtcNow;
            db.Departments.Add(new Department { Id = deptA, Name = "Prod", Code = $"A{tag}", OrganizationId = orgA });
            db.Departments.Add(new Department { Id = deptB, Name = "Prod", Code = $"B{tag}", OrganizationId = orgB });
            db.UserProfiles.Add(new UserProfile { UserId = alice, Name = "Alice", Email = $"alice{tag}@t", Role = "user", Poste = "P", Equipe = "A", DepartmentId = deptA });
            db.UserProfiles.Add(new UserProfile { UserId = bob, Name = "Bob", Email = $"bob{tag}@t", Role = "user", Poste = "P", Equipe = "A", DepartmentId = deptB });
            db.Claims.Add(new Claim { Title = $"a-{tag}", StatusCode = "OUVERTE", AssignedToId = alice, CreatedById = "someone", DetectionDate = now, CreatedAt = now });
            db.Claims.Add(new Claim { Title = $"b-{tag}", StatusCode = "OUVERTE", AssignedToId = bob, CreatedById = "someone", DetectionDate = now, CreatedAt = now });
            db.Claims.Add(new Claim { Title = $"b-by-bob-{tag}", StatusCode = "OUVERTE", CreatedById = bob, DetectionDate = now, CreatedAt = now });   // no assignee: follows its creator
            db.ActionPlans.Add(new Core.Entities.ActionPlan { Title = $"plan-a-{tag}", OrganizationId = orgA, DepartmentId = deptA, OwnerId = "x", CreatedBy = "x", Type = ActionPlanType.PAC });
            db.ActionPlans.Add(new Core.Entities.ActionPlan { Title = $"plan-b-{tag}", OrganizationId = orgB, DepartmentId = deptB, OwnerId = "x", CreatedBy = "x", Type = ActionPlanType.PAC });
            return Task.CompletedTask;
        });

        var superadmin = ClientAs("superadmin");
        async Task<List<string>> Titles(string url, string property)
            => (await superadmin.GetFromJsonAsync<JsonElement>(url, JsonOpts)).EnumerateArray()
                .Select(x => x.GetProperty(property).GetString() ?? "").Where(t => t.EndsWith(tag)).ToList();

        Assert.Equal(3, (await Titles("/api/QualityAnalysis/claims?pageSize=500", "title")).Count);                       // no selection: everything
        var onlyA = await Titles($"/api/QualityAnalysis/claims?pageSize=500&organizationIds={orgA}", "title");
        Assert.Equal([$"a-{tag}"], onlyA);
        var onlyB = await Titles($"/api/QualityAnalysis/claims?pageSize=500&organizationIds={orgB}", "title");
        Assert.Equal(2, onlyB.Count);
        Assert.Equal(3, (await Titles($"/api/QualityAnalysis/claims?pageSize=500&organizationIds={orgA},{orgB}", "title")).Count);

        Assert.Equal([$"plan-a-{tag}"], await Titles($"/api/ActionPlan?organizationIds={orgA}", "title"));

        // the claims history (used by the analyses hub and the audit page) follows the same choice
        async Task<List<string>> HistoryTitles(string suffix)
            => (await superadmin.GetFromJsonAsync<JsonElement>($"/api/QualityAnalysis/claims/history?pageSize=100&search={tag}{suffix}", JsonOpts))
                .GetProperty("items").EnumerateArray().Select(x => x.GetProperty("title").GetString() ?? "").ToList();
        Assert.Equal(3, (await HistoryTitles("")).Count);
        Assert.Equal([$"a-{tag}"], await HistoryTitles($"&organizationIds={orgA}"));
        Assert.Equal(2, (await Titles("/api/ActionPlan", "title")).Count);
    }

    [Fact]
    public async Task TheDepartmentAndEmployeeLists_FollowTheOrganizationsChosenBySuperadmin()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        var orgA = await OrgAsync(OrganizationType.Corporate);
        var orgB = await OrgAsync(OrganizationType.Corporate);
        var deptA = Guid.NewGuid();
        var deptB = Guid.NewGuid();
        var alice = Guid.NewGuid().ToString();
        var bob = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            db.Departments.Add(new Department { Id = deptA, Name = $"Prod-A-{tag}", Code = $"A{tag}", OrganizationId = orgA });
            db.Departments.Add(new Department { Id = deptB, Name = $"Prod-B-{tag}", Code = $"B{tag}", OrganizationId = orgB });
            db.UserProfiles.Add(new UserProfile { UserId = alice, Name = $"Alice-{tag}", Email = $"alice{tag}@t", Role = "user", Poste = "P", Equipe = "A", DepartmentId = deptA });
            db.UserProfiles.Add(new UserProfile { UserId = bob, Name = $"Bob-{tag}", Email = $"bob{tag}@t", Role = "user", Poste = "P", Equipe = "A", DepartmentId = deptB });
            return Task.CompletedTask;
        });

        var superadmin = ClientAs("superadmin");
        async Task<List<string>> Names(string url)
            => (await superadmin.GetFromJsonAsync<JsonElement>(url, JsonOpts)).EnumerateArray()
                .Select(x => x.GetProperty("name").GetString() ?? "").Where(n => n.EndsWith(tag)).ToList();

        Assert.Equal(2, (await Names("/api/Department")).Count);
        Assert.Equal([$"Prod-A-{tag}"], await Names($"/api/Department?organizationIds={orgA}"));
        Assert.Equal(2, (await Names("/api/admin/employees/profiles")).Count);
        Assert.Equal([$"Bob-{tag}"], await Names($"/api/admin/employees/profiles?organizationIds={orgB}"));
    }

    [Fact]
    public async Task ClaimNames_FollowTheCurrentProfile_AndAMergedAccountShowsTheAccountThatReplacedIt()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        var oldId = Guid.NewGuid().ToString();
        var keptId = Guid.NewGuid().ToString();
        var renamedId = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            var now = DateTime.UtcNow;
            db.UserProfiles.Add(new UserProfile { UserId = oldId, Name = $"ahlem alaya {tag}", Email = $"old{tag}@t", Role = "user", Poste = "P", Equipe = "A" });
            db.UserProfiles.Add(new UserProfile { UserId = keptId, Name = $"Ahlem Alaya {tag}", Email = $"kept{tag}@t", Role = "user", Poste = "P", Equipe = "A" });
            db.UserProfiles.Add(new UserProfile { UserId = renamedId, Name = $"Nouveau Nom {tag}", Email = $"ren{tag}@t", Role = "user", Poste = "P", Equipe = "A" });
            db.UserAliases.Add(new UserAlias { OldUserId = oldId, UserId = keptId });
            // the text stored with the claim is the name at the time it was written
            db.Claims.Add(new Claim { Title = $"merged-{tag}", StatusCode = "OUVERTE", CreatedById = oldId, CreatedBy = $"ahlem alaya {tag}", DetectionDate = now, CreatedAt = now });
            db.Claims.Add(new Claim { Title = $"renamed-{tag}", StatusCode = "OUVERTE", CreatedById = renamedId, CreatedBy = "Ancien Nom", DetectionDate = now, CreatedAt = now });
            db.Claims.Add(new Claim { Title = $"unknown-{tag}", StatusCode = "OUVERTE", CreatedById = Guid.NewGuid().ToString(), CreatedBy = "Snapshot Only", DetectionDate = now, CreatedAt = now });
            return Task.CompletedTask;
        });

        var list = await ClientAs("superadmin").GetFromJsonAsync<JsonElement>($"/api/QualityAnalysis/claims?pageSize=500", JsonOpts);
        string CreatedBy(string title) => list.EnumerateArray().First(c => c.GetProperty("title").GetString() == $"{title}-{tag}").GetProperty("createdBy").GetString()!;

        Assert.Equal($"Ahlem Alaya {tag}", CreatedBy("merged"));        // the old account shows the person it was merged into
        Assert.Equal($"Nouveau Nom {tag}", CreatedBy("renamed"));       // a rename follows, the stored text is not frozen
        Assert.Equal("Snapshot Only", CreatedBy("unknown"));            // no profile to ask: the stored text stays
    }
}
