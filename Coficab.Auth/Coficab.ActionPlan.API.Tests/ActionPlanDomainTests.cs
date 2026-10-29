using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Multi-sector scope: an action plan belongs to a business domain (reference list "domain"), shown, checked and filterable.</summary>
public class ActionPlanDomainTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly ActionPlanApiFactory _factory;

    public ActionPlanDomainTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<(Guid Org, Guid Dept)> SeedDepartmentAsync()
    {
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            return Task.CompletedTask;
        });
        return (org, dept);
    }

    private static object Body(string title, Guid org, Guid dept, string? domain) =>
        new { title, type = 2, organizationId = org, departmentId = dept, domain };

    [Fact]
    public async Task APlanKeepsItsDomain_AndAPlanWithoutOneIsAQualityPlan()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var admin = ClientAs("admin");

        var maintenance = await admin.PostAsJsonAsync("/api/ActionPlan", Body("Graissage ligne WR-02", org, dept, "maintenance"));
        Assert.Equal(HttpStatusCode.Created, maintenance.StatusCode);
        Assert.Equal("MAINTENANCE", (await maintenance.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("domain").GetString());   // the code of the list, whatever the case sent

        var plain = await admin.PostAsJsonAsync("/api/ActionPlan", Body("Sans domaine", org, dept, null));
        Assert.Equal("QUALITY", (await plain.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("domain").GetString());
    }

    [Fact]
    public async Task APlanSentWithOnlyItsDepartment_TakesTheOrganizationOfTheDepartment()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var response = await ClientAs("admin").PostAsJsonAsync("/api/ActionPlan", new { title = "Sans organisation", type = 2, departmentId = dept, domain = "HSE" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(org, (await response.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("organizationId").GetGuid());
    }

    [Fact]
    public async Task TheEmployeesPlan_CarriesItsDepartmentAndDomain_InTheListAndInTheDetail()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var me = TestAuthHandler.TestUserId.ToString();
        var id = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = id, Title = "plan employe", Domain = "LOGISTICS", OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x",
                AssignedToId = me, Type = ActionPlanType.PAC, Status = ActionPlanStatus.Ongoing,
            });
            return Task.CompletedTask;
        });
        var user = ClientAs("user");
        var deptName = $"Dept-{dept:N}"[..12];

        var list = await user.GetFromJsonAsync<JsonElement>("/api/ActionPlan/user/assigned", JsonOpts);
        var row = list.EnumerateArray().First(e => e.GetProperty("id").GetString() == id.ToString());
        Assert.Equal(deptName, row.GetProperty("departmentName").GetString());
        Assert.Equal("LOGISTICS", row.GetProperty("domain").GetString());

        var detail = await user.GetFromJsonAsync<JsonElement>($"/api/ActionPlan/assigned/{id}", JsonOpts);
        Assert.Equal(deptName, detail.GetProperty("departmentName").GetString());
    }

    [Fact]
    public async Task APlanCreatedWithItsActions_HoldsEachActionOnce()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var created = await ClientAs("admin").PostAsJsonAsync("/api/ActionPlan", new
        {
            title = "Avec actions", type = 2, departmentId = dept, organizationId = org,
            planActions = new[] { new { title = "A1", priority = 1 }, new { title = "A2", priority = 2 } },
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("id").GetGuid();
        var actions = await ClientAs("admin").GetFromJsonAsync<JsonElement>($"/api/planaction/by-plan/{id}", JsonOpts);
        Assert.Equal(2, actions.GetArrayLength());
    }

    [Fact]
    public async Task AProofCanBeAttachedToAnAction_ListedCountedAndDownloaded_ByThoseWhoCanWorkOnThePlan()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var me = TestAuthHandler.TestUserId.ToString();
        var planId = Guid.NewGuid();
        var otherPlan = Guid.NewGuid();
        var actionId = Guid.NewGuid();
        var otherAction = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            Core.Entities.ActionPlan Plan(Guid pid, string? assignee) => new()
            {
                Id = pid, Title = "preuves", OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x", AssignedToId = assignee,
                Type = ActionPlanType.PAC, Status = ActionPlanStatus.Ongoing,
            };
            var mine = Plan(planId, me);
            mine.PlanActions.Add(new PlanAction { Id = actionId, Title = "a", Priority = 1, AssignedToId = me });
            var notMine = Plan(otherPlan, "someone-else");
            notMine.PlanActions.Add(new PlanAction { Id = otherAction, Title = "b", Priority = 1, AssignedToId = "someone-else" });
            db.ActionPlans.AddRange(mine, notMine);
            return Task.CompletedTask;
        });
        var user = ClientAs("user");

        HttpContent File(string name, byte[] bytes, string type)
        {
            var form = new MultipartFormDataContent();
            var part = new ByteArrayContent(bytes);
            part.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(type);
            form.Add(part, "file", name);
            return form;
        }

        var ok = await user.PostAsync($"/api/planaction/{actionId}/documents", File("preuve.png", new byte[] { 1, 2, 3, 4 }, "image/png"));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var docId = (await ok.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.BadRequest, (await user.PostAsync($"/api/planaction/{actionId}/documents", File("virus.html", new byte[] { 1 }, "text/html"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.PostAsync($"/api/planaction/{otherAction}/documents", File("preuve.png", new byte[] { 1 }, "image/png"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await user.PostAsync($"/api/planaction/{Guid.NewGuid()}/documents", File("preuve.png", new byte[] { 1 }, "image/png"))).StatusCode);

        var list = await user.GetFromJsonAsync<JsonElement>($"/api/planaction/{actionId}/documents", JsonOpts);
        Assert.Equal("preuve.png", Assert.Single(list.EnumerateArray()).GetProperty("fileName").GetString());

        var actions = await user.GetFromJsonAsync<JsonElement>($"/api/planaction/by-plan/{planId}", JsonOpts);
        Assert.Equal(1, actions[0].GetProperty("documentCount").GetInt32());

        // the proof is part of the history of the action and of the plan, and the list says who attached it
        var history = await user.GetFromJsonAsync<JsonElement>($"/api/planaction/{actionId}/history", JsonOpts);
        Assert.Contains(history.EnumerateArray(), h => (h.GetProperty("note").GetString() ?? "").StartsWith("Preuve ajoutée : preuve.png"));
        Assert.All(history.EnumerateArray(), h => Assert.Equal(JsonValueKind.Number, h.GetProperty("newProgress").ValueKind));   // a percentage, not the name of the enum
        var planHistory = await user.GetFromJsonAsync<JsonElement>($"/api/ActionPlan/assigned/{planId}/history", JsonOpts);
        Assert.Contains(planHistory.EnumerateArray(), h => h.GetProperty("actionType").GetString() == "subaction_proof");
        Assert.Equal(HttpStatusCode.NotFound, (await user.GetAsync($"/api/ActionPlan/assigned/{otherPlan}/history")).StatusCode);
        Assert.Equal(me, list[0].GetProperty("uploadedBy").GetString());
        var detail = await ClientAs("admin").GetFromJsonAsync<JsonElement>($"/api/actionplan/{planId}/detail", JsonOpts);          // the admin page lists the proofs of each action too
        Assert.Equal(1, detail.GetProperty("actions")[0].GetProperty("proofCount").GetInt32());
        var assignments = await user.GetFromJsonAsync<JsonElement>($"/api/planaction/{actionId}/assignment-history", JsonOpts);
        Assert.Equal(JsonValueKind.Array, assignments.ValueKind);                                  // the "History" window of an action needs this route
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync($"/api/planaction/{otherAction}/assignment-history")).StatusCode);

        var file = await user.GetAsync($"/api/planaction/documents/{docId}/file");
        Assert.Equal(HttpStatusCode.OK, file.StatusCode);
        Assert.Equal(new byte[] { 1, 2, 3, 4 }, await file.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task ADomainOutsideTheList_IsRefused()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var response = await ClientAs("admin").PostAsJsonAsync("/api/ActionPlan", Body("Domaine inconnu", org, dept, "ASTROLOGY"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("ASTROLOGY", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task TheDomainCanBeChanged_AndTheChangeIsInTheHistory_AndEmptyKeepsIt()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var admin = ClientAs("admin");
        var created = await (await admin.PostAsJsonAsync("/api/ActionPlan", Body("Plan HSE", org, dept, "HSE"))).Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        var id = created.GetProperty("id").GetGuid();

        object Update(string? domain) => new { title = "Plan HSE", status = 1, type = 2, organizationId = org, departmentId = dept, domain };
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/ActionPlan/{id}", Update(null))).StatusCode);
        Assert.Equal("HSE", (await admin.GetFromJsonAsync<JsonElement>($"/api/ActionPlan/{id}", JsonOpts)).GetProperty("domain").GetString());

        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/ActionPlan/{id}", Update("LOGISTICS"))).StatusCode);
        Assert.Equal("LOGISTICS", (await admin.GetFromJsonAsync<JsonElement>($"/api/ActionPlan/{id}", JsonOpts)).GetProperty("domain").GetString());
        var history = await admin.GetStringAsync("/api/ActionPlan/history");
        Assert.Contains("Domaine: HSE", history);
    }

    [Fact]
    public async Task TheListsCanBeFilteredByDomain_ForTheAdminAndTheEmployee()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var me = TestAuthHandler.TestUserId.ToString();
        await _factory.SeedAsync(db =>
        {
            Core.Entities.ActionPlan Plan(string title, string domain) => new()
            {
                Title = $"{title}-{tag}", Domain = domain, OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x", AssignedToId = me, Type = ActionPlanType.PAC,
            };
            db.ActionPlans.AddRange(Plan("hse-plan", "HSE"), Plan("prod-plan", "PRODUCTION"));
            return Task.CompletedTask;
        });

        async Task<List<(string Title, string Domain)>> Titles(HttpClient c, string query) =>
            (await c.GetFromJsonAsync<JsonElement>($"/api/ActionPlan{query}", JsonOpts)).EnumerateArray()
                .Select(e => (e.GetProperty("title").GetString()!, e.GetProperty("domain").GetString()!)).Where(t => t.Item1.EndsWith(tag)).ToList();

        var admin = await Titles(ClientAs("admin"), "?domain=hse");
        Assert.Equal(new[] { ($"hse-plan-{tag}", "HSE") }, admin);
        Assert.Equal(2, (await Titles(ClientAs("admin"), "")).Count);

        var employee = await Titles(ClientAs("user"), "?domain=PRODUCTION");                         // the employee's own plans, narrowed
        Assert.Equal(new[] { ($"prod-plan-{tag}", "PRODUCTION") }, employee);
    }

    [Fact]
    public async Task TheCapaIndicators_FollowTheDomainFilter_AndKeepTheComparisonByDomain()
    {
        var (org, dept) = await SeedDepartmentAsync();
        var now = DateTime.UtcNow;
        await _factory.SeedAsync(db =>
        {
            Core.Entities.ActionPlan Plan(string domain, DateTime? deadline) => new()
            {
                Title = $"kpi-{domain}-{Guid.NewGuid():N}"[..20], Domain = domain, OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x",
                Type = ActionPlanType.PAC, Status = ActionPlanStatus.Ongoing, CreatedAt = now.AddDays(-20), Deadline = deadline,
            };
            db.ActionPlans.AddRange(Plan("HSE", now.AddDays(-5)), Plan("HSE", now.AddDays(10)), Plan("PRODUCTION", now.AddDays(-3)));
            return Task.CompletedTask;
        });

        var admin = ClientAs("admin");
        var all = await admin.GetFromJsonAsync<JsonElement>($"/api/dashboard/capa-indicators?days=90&organizationIds={org}", JsonOpts);
        Assert.Equal(3, all.GetProperty("kpis").GetProperty("openPlans").GetInt32());

        var hse = await admin.GetFromJsonAsync<JsonElement>($"/api/dashboard/capa-indicators?days=90&organizationIds={org}&domain=hse", JsonOpts);
        Assert.Equal(2, hse.GetProperty("kpis").GetProperty("openPlans").GetInt32());
        Assert.Equal(1, hse.GetProperty("kpis").GetProperty("latePlans").GetInt32());

        var byDomain = hse.GetProperty("byDomain").EnumerateArray().ToDictionary(e => e.GetProperty("domain").GetString()!, e => e.GetProperty("openPlans").GetInt32());
        Assert.Equal(2, byDomain["HSE"]);                                       // the comparison keeps every domain of the perimeter
        Assert.Equal(1, byDomain["PRODUCTION"]);
    }

    [Fact]
    public async Task TheSevenStandardDomainsAreInTheReferenceLists()
    {
        await _factory.SeedAsync(db => ProductionReferenceData.EnsureAsync(db, CancellationToken.None));
        var lists = await ClientAs("admin").GetFromJsonAsync<JsonElement>("/api/reference-lists", JsonOpts);
        var values = lists.GetProperty("lists").GetProperty("domain").EnumerateArray().Select(e => e.GetProperty("value").GetString()).ToList();
        foreach (var (code, _) in ActionPlanDomains.Standard) Assert.Contains(code, values);
    }
}
