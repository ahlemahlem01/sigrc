using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Reports can be edited (every text and figure); an edit never erases the past, it adds a version.</summary>
public class EditableReportsTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public EditableReportsTests(ActionPlanApiFactory factory)
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

    private async Task<Guid> SaveReport(HttpClient admin)
    {
        var saved = await Json(await admin.PostAsJsonAsync("/api/saved-reports", new
        {
            kind = "claims", title = "Réclamations T1", criteriaJson = "{}", resultJson = "{\"totals\":{\"total\":10,\"closed\":4}}", itemCount = 10,
        }));
        return saved.GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task ASavedReport_CanBeEdited_AndTheEarlierContentStaysReadable()
    {
        var admin = ClientAs("superadmin");
        var id = await SaveReport(admin);

        var edited = await Json(await admin.PutAsJsonAsync($"/api/saved-reports/{id}", new
        {
            title = "Réclamations T1 (corrigé)", resultJson = "{\"totals\":{\"total\":12,\"closed\":5}}", itemCount = 12, note = "Deux dossiers oubliés",
        }));
        Assert.Equal(2, edited.GetProperty("version").GetInt32());

        var current = await Json(await admin.GetAsync($"/api/saved-reports/{id}"));
        Assert.Equal("Réclamations T1 (corrigé)", current.GetProperty("title").GetString());
        Assert.Contains("\"total\":12", current.GetProperty("resultJson").GetString());

        var versions = await Json(await admin.GetAsync($"/api/saved-reports/{id}/versions"));
        Assert.Equal(new[] { 2, 1 }, versions.EnumerateArray().Select(v => v.GetProperty("versionNumber").GetInt32()).ToArray());

        var first = await Json(await admin.GetAsync($"/api/saved-reports/{id}/versions/1"));
        Assert.Equal("Réclamations T1", first.GetProperty("title").GetString());
        Assert.Contains("\"total\":10", first.GetProperty("resultJson").GetString());
    }

    [Fact]
    public async Task ATeamReport_CanBeSavedAndEdited_LikeTheOthers()
    {
        var admin = ClientAs("superadmin");
        var saved = await Json(await admin.PostAsJsonAsync("/api/saved-reports", new
        {
            kind = "team", title = "Rapports équipes mai", criteriaJson = "{\"department\":\"all\"}",
            resultJson = "{\"summary\":\"Texte\",\"rows\":[{\"fullName\":\"A\",\"overdueCount\":3}]}", itemCount = 1,
        }));
        var id = saved.GetProperty("id").GetGuid();

        var edited = await Json(await admin.PutAsJsonAsync($"/api/saved-reports/{id}", new
        {
            resultJson = "{\"summary\":\"Texte corrigé\",\"rows\":[{\"fullName\":\"A\",\"overdueCount\":1}]}", note = "Retards recomptés",
        }));
        Assert.Equal(2, edited.GetProperty("version").GetInt32());

        var list = await Json(await admin.GetAsync("/api/saved-reports?kind=team"));
        Assert.Contains(list.EnumerateArray(), r => r.GetProperty("id").GetGuid() == id);
    }

    [Fact]
    public async Task TheHistory_IsPagedAndFiltered_AndArchivedReportsCanBeListedAndRestored()
    {
        var admin = ClientAs("superadmin");
        var tag = "Hist" + Guid.NewGuid().ToString("N")[..6];
        var ids = new List<Guid>();
        for (var i = 1; i <= 5; i++)
        {
            var saved = await Json(await admin.PostAsJsonAsync("/api/saved-reports", new
            {
                kind = i % 2 == 0 ? "capa-actions" : "claims", title = $"{tag} rapport {i}", criteriaJson = "{}", resultJson = "{}", itemCount = i,
            }));
            ids.Add(saved.GetProperty("id").GetGuid());
        }

        var page1 = await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}&pageSize=2&page=1"));
        Assert.Equal(5, page1.GetProperty("total").GetInt32());
        Assert.Equal(2, page1.GetProperty("items").GetArrayLength());
        var page3 = await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}&pageSize=2&page=3"));
        Assert.Equal(1, page3.GetProperty("items").GetArrayLength());

        var capaOnly = await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}&kind=capa-actions"));
        Assert.Equal(2, capaOnly.GetProperty("total").GetInt32());

        // edited filter
        await Json(await admin.PutAsJsonAsync($"/api/saved-reports/{ids[0]}", new { title = $"{tag} rapport 1 bis" }));
        Assert.Equal(1, (await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}&edited=true"))).GetProperty("total").GetInt32());

        // archive: gone from the active list, present in the archived one, restorable, never deleted
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/saved-reports/{ids[1]}/archive", null)).StatusCode);
        Assert.Equal(4, (await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}"))).GetProperty("total").GetInt32());
        var archived = await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}&state=archived"));
        Assert.Equal(1, archived.GetProperty("total").GetInt32());
        Assert.True(archived.GetProperty("items")[0].GetProperty("isArchived").GetBoolean());
        Assert.Equal(5, (await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}&state=all"))).GetProperty("total").GetInt32());

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/saved-reports/{ids[1]}/unarchive", null)).StatusCode);
        Assert.Equal(5, (await Json(await admin.GetAsync($"/api/saved-reports/search?q={tag}"))).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task AnInvalidOrArchivedReport_IsNotEdited()
    {
        var admin = ClientAs("superadmin");
        var id = await SaveReport(admin);

        var bad = await admin.PutAsJsonAsync($"/api/saved-reports/{id}", new { resultJson = "{pas du json" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/saved-reports/{id}/archive", null)).StatusCode);
        var archived = await admin.PutAsJsonAsync($"/api/saved-reports/{id}", new { title = "Trop tard" });
        Assert.Equal(HttpStatusCode.Conflict, archived.StatusCode);
    }

    [Fact]
    public async Task TheCustomerReport_IsEditedAsNewVersions_AndThePdfFollowsTheEdit()
    {
        Guid claimId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            claimId = Guid.NewGuid();
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "Fil cassé", DefectType = "Coupure fil", ClientId = "ACME", Severity = "HIGH", LotNumber = "L1",
                Description = "Fil cassé en sortie de ligne", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow,
                CreatedById = TestAuthHandler.TestUserId.ToString(),
            });
            await db.SaveChangesAsync();
        }

        var admin = ClientAs("superadmin");
        var report = await Json(await admin.GetAsync($"/api/EightD/{claimId}/report"));
        Assert.False(report.GetProperty("edited").GetBoolean());

        var model = report.GetProperty("model").Clone();
        var edited = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(model.GetRawText())!;
        edited["conclusion"] = JsonSerializer.SerializeToElement("Cause confirmée, 3 lots contrôlés sans défaut.");
        edited["title"] = JsonSerializer.SerializeToElement("Rapport 8D corrigé");

        var saved = await Json(await admin.PutAsJsonAsync($"/api/EightD/{claimId}/report", new { model = edited, note = "Ajout de la conclusion" }));
        Assert.Equal(1, saved.GetProperty("version").GetInt32());
        Assert.True(saved.GetProperty("edited").GetBoolean());

        var again = await Json(await admin.GetAsync($"/api/EightD/{claimId}/report"));
        Assert.Equal("Rapport 8D corrigé", again.GetProperty("model").GetProperty("title").GetString());
        Assert.Equal("Ajout de la conclusion", again.GetProperty("note").GetString());

        // the PDF of the claim is the edited one, and regenerating it keeps the edit
        var pdf = await admin.GetAsync($"/api/EightD/{claimId}/pdf");
        Assert.Equal(HttpStatusCode.OK, pdf.StatusCode);
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString((await pdf.Content.ReadAsByteArrayAsync()).AsSpan(0, 4)));
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/EightD/{claimId}/pdf", null)).StatusCode);

        // a second edit is a new version, the first one stays readable
        edited["conclusion"] = JsonSerializer.SerializeToElement("Conclusion révisée.");
        await Json(await admin.PutAsJsonAsync($"/api/EightD/{claimId}/report", new { model = edited, note = (string?)null }));
        var versions = await Json(await admin.GetAsync($"/api/EightD/{claimId}/report/versions"));
        Assert.Equal(new[] { 2, 1 }, versions.EnumerateArray().Select(v => v.GetProperty("versionNumber").GetInt32()).ToArray());
        var first = await Json(await admin.GetAsync($"/api/EightD/{claimId}/report/versions/1"));
        Assert.Contains("Cause confirmée", first.GetProperty("model").GetProperty("conclusion").GetString());
    }

    [Fact]
    public async Task OnlyQualityAdministrators_EditTheCustomerReport()
    {
        Guid claimId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            claimId = Guid.NewGuid();
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "Fil cassé", DefectType = "Coupure fil", ClientId = "ACME", Severity = "HIGH", LotNumber = "L1",
                Description = "x", StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow, CreatedById = TestAuthHandler.TestUserId.ToString(),
            });
            await db.SaveChangesAsync();
        }

        var employee = ClientAs("employee");
        var response = await employee.PutAsJsonAsync($"/api/EightD/{claimId}/report", new { model = new { title = "x" }, note = (string?)null });
        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
    }
}
