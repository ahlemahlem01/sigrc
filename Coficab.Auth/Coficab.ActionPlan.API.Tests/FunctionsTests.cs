using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The functions of the specification: department, links, job description, holders with a status, and the rights a function carries.</summary>
public class FunctionsTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public FunctionsTests(ActionPlanApiFactory factory)
    {
        _factory = factory;
        _factory.SeedAsync(_ => Task.CompletedTask).GetAwaiter().GetResult();
    }

    private HttpClient ClientAs(string role, string? userId = null)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (userId != null) client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, userId);
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private async Task<(Guid department, string userId)> SeedDepartmentAndPerson()
    {
        var userId = Guid.NewGuid().ToString();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var org = new Organization { Name = "Org " + Guid.NewGuid().ToString("N")[..5] };
        db.Organizations.Add(org);
        var dept = new Department { Name = "Dept " + Guid.NewGuid().ToString("N")[..5], Code = "D" + Guid.NewGuid().ToString("N")[..4], OrganizationId = org.Id };
        db.Departments.Add(dept);
        db.UserProfiles.Add(new UserProfile { Id = Guid.NewGuid(), UserId = userId, Name = "Chef Qualité", Email = "cq@t.com", Role = "user", Poste = "Resp. qualité", Equipe = "Q" });
        await db.SaveChangesAsync();
        return (dept.Id, userId);
    }

    [Fact]
    public async Task AFunction_IsCreatedInADepartment_WithLinks_AndTheCodeIsUniqueThere()
    {
        var (dept, _) = await SeedDepartmentAndPerson();
        var admin = ClientAs("admin");

        var boss = await Json(await admin.PostAsJsonAsync("/api/functions", new { code = "DIR-QUAL", description = "Directeur qualité", departmentId = dept }));
        Assert.NotEqual(Guid.Empty, boss.GetProperty("id").GetGuid());

        var ok = await admin.PostAsJsonAsync("/api/functions", new { code = "RESP-QUAL", description = "Responsable qualité", departmentId = dept, hierarchicalLink = "DIR-QUAL", functionalLink = "DIR-QUAL" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/functions", new { code = "resp-qual", description = "Doublon", departmentId = dept })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/functions", new { code = "X-1", description = "Lien inconnu", departmentId = dept, hierarchicalLink = "N-EXISTE-PAS" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/functions", new { code = "X-2", description = "Droit inconnu", departmentId = dept, permissions = new[] { "all:everything" } })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PostAsJsonAsync("/api/functions", new { code = "X-3", description = "Interdit", departmentId = dept })).StatusCode);
    }

    [Fact]
    public async Task APerson_CanHoldSeveralFunctions_WithAStatus_AndNothingIsDeleted()
    {
        var (dept, person) = await SeedDepartmentAndPerson();
        var admin = ClientAs("admin");
        var f1 = (await Json(await admin.PostAsJsonAsync("/api/functions", new { code = "F-A", description = "Fonction A", departmentId = dept }))).GetProperty("id").GetGuid();
        var f2 = (await Json(await admin.PostAsJsonAsync("/api/functions", new { code = "F-B", description = "Fonction B", departmentId = dept }))).GetProperty("id").GetGuid();

        var a1 = (await Json(await admin.PostAsJsonAsync("/api/functions/assignments", new { userId = person, functionId = f1, status = "Active" }))).GetProperty("id").GetGuid();
        await Json(await admin.PostAsJsonAsync("/api/functions/assignments", new { userId = person, functionId = f2, status = "ByInterim" }));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/functions/assignments", new { userId = person, functionId = f1, status = "Active" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/functions/assignments", new { userId = person, functionId = f2, status = "Whatever" })).StatusCode);

        var held = await Json(await admin.GetAsync($"/api/functions/assignments?userId={person}"));
        Assert.Equal(2, held.GetArrayLength());

        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/functions/assignments/{a1}", new { status = "NotActive" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/functions/assignments/{a1}")).StatusCode);
        Assert.Equal(1, (await Json(await admin.GetAsync($"/api/functions/assignments?userId={person}"))).GetArrayLength());

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/functions/{f1}")).StatusCode);
        var list = await Json(await admin.GetAsync($"/api/functions?departmentId={dept}"));
        Assert.DoesNotContain(list.EnumerateArray(), f => f.GetProperty("id").GetGuid() == f1);
    }

    [Fact]
    public async Task AFunction_CarriesTheRightToValidate_ForWhoHoldsItActively_NotForWhoDoesNot()
    {
        var (dept, person) = await SeedDepartmentAndPerson();
        var admin = ClientAs("admin");
        var function = (await Json(await admin.PostAsJsonAsync("/api/functions", new { code = "RQ-" + Guid.NewGuid().ToString("N")[..4], description = "Responsable qualité", departmentId = dept, permissions = new[] { "8d:validate" } }))).GetProperty("id").GetGuid();

        var claim = Guid.NewGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            db.Claims.Add(new Claim { Id = claim, Title = "À valider", DefectType = "X", ClientId = "ACME", Severity = "MEDIUM", LotNumber = "L1", Description = "x", StatusCode = "PENDING_VALIDATION", Reference = "FN-" + claim.ToString()[..5] });
            await db.SaveChangesAsync();
        }
        var attempt = () => ClientAs("user", person).PostAsJsonAsync($"/api/EightD/{claim}/validate", new { isApproved = false, comment = "non" });

        Assert.Equal(HttpStatusCode.Forbidden, (await attempt()).StatusCode);                       // no function yet

        var holding = (await Json(await admin.PostAsJsonAsync("/api/functions/assignments", new { userId = person, functionId = function, status = "Active" }))).GetProperty("id").GetGuid();
        Assert.NotEqual(HttpStatusCode.Forbidden, (await attempt()).StatusCode);                    // the function gives the right

        var mine = await Json(await ClientAs("user", person).GetAsync("/api/functions/me"));
        Assert.Contains(mine.GetProperty("permissions").EnumerateArray(), p => p.GetString() == "8d:validate");

        await admin.PutAsJsonAsync($"/api/functions/assignments/{holding}", new { status = "NotActive" });
        Assert.Equal(HttpStatusCode.Forbidden, (await attempt()).StatusCode);                       // not active: no more right
    }

    [Fact]
    public async Task AnAdministrator_IsOfferedOnlyThePeopleOfHisDepartment_TheSuperadminEveryone()
    {
        Guid deptA, deptB; var adminId = Guid.NewGuid().ToString(); var mateId = Guid.NewGuid().ToString(); var otherId = Guid.NewGuid().ToString();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            var org = new Organization { Name = "Org " + Guid.NewGuid().ToString("N")[..5] };
            db.Organizations.Add(org);
            var a = new Department { Name = "A " + Guid.NewGuid().ToString("N")[..5], Code = "A" + Guid.NewGuid().ToString("N")[..4], OrganizationId = org.Id };
            var b = new Department { Name = "B " + Guid.NewGuid().ToString("N")[..5], Code = "B" + Guid.NewGuid().ToString("N")[..4], OrganizationId = org.Id };
            db.Departments.AddRange(a, b);
            db.UserProfiles.AddRange(
                new UserProfile { Id = Guid.NewGuid(), UserId = adminId, Name = "Admin A", Email = "a@t.com", Role = "admin", Poste = "x", Equipe = "x", DepartmentId = a.Id },
                new UserProfile { Id = Guid.NewGuid(), UserId = mateId, Name = "Collegue A", Email = "m@t.com", Role = "user", Poste = "x", Equipe = "x", DepartmentId = a.Id },
                new UserProfile { Id = Guid.NewGuid(), UserId = otherId, Name = "Autre B", Email = "o@t.com", Role = "user", Poste = "x", Equipe = "x", DepartmentId = b.Id });
            await db.SaveChangesAsync();
            deptA = a.Id; deptB = b.Id;
        }

        var seen = await Json(await ClientAs("admin", adminId).GetAsync("/api/functions/people"));
        var ids = seen.EnumerateArray().Select(x => x.GetProperty("id").GetString()).ToList();
        Assert.Contains(adminId, ids);
        Assert.Contains(mateId, ids);
        Assert.DoesNotContain(otherId, ids);

        var all = await Json(await ClientAs("superadmin", Guid.NewGuid().ToString()).GetAsync("/api/functions/people"));
        var everyone = all.EnumerateArray().Select(x => x.GetProperty("id").GetString()).ToList();
        Assert.Contains(otherId, everyone);
        Assert.Contains(mateId, everyone);

        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").GetAsync("/api/functions/people")).StatusCode);
    }
}
