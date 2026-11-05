using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Modules of the contract, notification schedule, personal data, archived status, and the validation desk for function holders.</summary>
public class ModulesPersonalValidationTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;

    public ModulesPersonalValidationTests(ActionPlanApiFactory factory)
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

    private async Task<string> AddPerson(string name = "Personne Test")
    {
        var id = Guid.NewGuid().ToString();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        db.UserProfiles.Add(new UserProfile { Id = Guid.NewGuid(), UserId = id, Name = name, Email = id[..6] + "@t.com", Role = "user", Poste = "Op", Equipe = "A" });
        await db.SaveChangesAsync();
        return id;
    }

    [Fact]
    public async Task TheSuperadminSwitchesModules_AndAnInactiveQrqcModuleIsClosed()
    {
        var modules = await Json(await ClientAs("user").GetAsync("/api/system/modules"));
        Assert.Contains(modules.EnumerateArray(), m => m.GetProperty("code").GetString() == "qrqc" && m.GetProperty("isActive").GetBoolean());

        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("admin").PutAsJsonAsync("/api/system/modules/qrqc", new { isActive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ClientAs("superadmin").PutAsJsonAsync("/api/system/modules/inconnu", new { isActive = false })).StatusCode);

        try
        {
            Assert.Equal(HttpStatusCode.OK, (await ClientAs("superadmin").PutAsJsonAsync("/api/system/modules/qrqc", new { isActive = false })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("superadmin").GetAsync("/api/qrqc/board")).StatusCode);
        }
        finally
        {
            await ClientAs("superadmin").PutAsJsonAsync("/api/system/modules/qrqc", new { isActive = true });
        }
        Assert.Equal(HttpStatusCode.OK, (await ClientAs("superadmin").GetAsync("/api/qrqc/board")).StatusCode);
    }

    [Fact]
    public async Task TheNotificationSchedule_IsSavedByAnAdministrator_AndRefusedWhenImpossible()
    {
        var admin = ClientAs("admin");
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/system/notifications", new { mode = 2, hour = 9, day = 1, daysMask = 0 })).StatusCode);
        var saved = await Json(await admin.GetAsync("/api/system/notifications"));
        Assert.Equal(2, saved.GetProperty("mode").GetInt32());
        Assert.Equal(9, saved.GetProperty("hour").GetInt32());

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/system/notifications", new { mode = 1, hour = 30, day = 1, daysMask = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/system/notifications", new { mode = 3, hour = 8, day = 1, daysMask = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PutAsJsonAsync("/api/system/notifications", new { mode = 1, hour = 8, day = 1, daysMask = 0 })).StatusCode);
    }

    [Fact]
    public async Task PersonalData_IsKeptByTheAdministrator_WithSeveralNationalities_AndChecked()
    {
        var person = await AddPerson();
        var admin = ClientAs("admin");

        var body = new
        {
            dateOfBirth = "1995-04-12", nationalities = new[] { "Tunisienne", "Française" }, cinNumber = "01234567", cinDate = "2015-06-01", cinCountry = "Tunisie",
            passportNumber = "P1234567", passportValidFrom = "2022-01-01", passportValidTill = "2032-01-01", passportCountry = "Tunisie",
            fatherName = "Ali", fatherLastName = "Ben Salah", motherName = "Samia", motherLastName = "Trabelsi",
            firstName = "Rania", lastName = "Bouazizi", site = "Coficab Tunisia - Mateur", additionalEmails = new[] { "rania@perso.tn", "r.bouazizi@coficab.com" },
        };
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{person}/personal", body)).StatusCode);

        var read = await Json(await admin.GetAsync($"/api/admin/employees/profiles/{person}/personal"));
        Assert.Equal(2, read.GetProperty("nationalities").GetArrayLength());
        Assert.Equal("01234567", read.GetProperty("cinNumber").GetString());
        Assert.Equal("Trabelsi", read.GetProperty("motherLastName").GetString());
        Assert.Equal("Bouazizi", read.GetProperty("lastName").GetString());
        Assert.Equal("Coficab Tunisia - Mateur", read.GetProperty("site").GetString());
        Assert.Equal(2, read.GetProperty("additionalEmails").GetArrayLength());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{person}/personal", new { additionalEmails = new[] { "not-an-email" } })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{person}/personal", new { dateOfBirth = "2999-01-01" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{person}/personal", new { passportValidFrom = "2030-01-01", passportValidTill = "2020-01-01" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user", person).GetAsync($"/api/admin/employees/profiles/{person}/personal")).StatusCode);
    }

    [Fact]
    public async Task APersonIsArchivedAndRestored_NothingIsDeleted()
    {
        var person = await AddPerson();
        var admin = ClientAs("admin");
        Assert.Equal("archived", (await Json(await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{person}/archive", new { archived = true }))).GetProperty("status").GetString());
        Assert.Equal("active", (await Json(await admin.PutAsJsonAsync($"/api/admin/employees/profiles/{person}/archive", new { archived = false }))).GetProperty("status").GetString());
    }

    [Fact]
    public async Task TheValidationDesk_OpensToAFunctionWithTheRight_AndOnlyToIt()
    {
        var person = await AddPerson("Responsable qualité");
        var client = ClientAs("user", person);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/validations/five-why")).StatusCode);

        Guid function;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
            var org = new Organization { Name = "Org " + Guid.NewGuid().ToString("N")[..5] };
            db.Organizations.Add(org);
            var dept = new Department { Name = "D" + Guid.NewGuid().ToString("N")[..4], Code = "DV", OrganizationId = org.Id };
            db.Departments.Add(dept);
            var f = new Function { FunctionCode = "RQ-" + Guid.NewGuid().ToString("N")[..4], Description = "Resp qualité", DepartmentId = dept.Id, Permissions = PermissionAccess.ValidateFiveWhy };
            db.Functions.Add(f);
            db.UserFunctions.Add(new UserFunction { UserId = person, FunctionId = f.Id, Status = Coficab.ActionPlan.Core.Enums.FunctionStatus.Active, HireDate = DateTime.UtcNow });
            await db.SaveChangesAsync();
            function = f.Id;
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/validations/five-why")).StatusCode);                       // right to validate a 5 Why
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/validations/dossiers/decide", new { claimIds = new[] { Guid.NewGuid() }, approve = true })).StatusCode);   // not the right to validate dossiers
        Assert.NotEqual(HttpStatusCode.Forbidden, (await ClientAs("admin").GetAsync("/api/validations/five-why")).StatusCode);
        Assert.NotEqual(Guid.Empty, function);
    }
}
