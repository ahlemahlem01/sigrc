using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A name is always shown with the short code of the department of the person: the directory gives it.</summary>
public class PeopleDirectoryTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public PeopleDirectoryTests(ActionPlanApiFactory factory) => _factory = factory;

    [Fact]
    public async Task TheDirectory_GivesEachPersonTheCodeOfTheirDepartment_AndNothingElse()
    {
        var user = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            var org = Guid.NewGuid();
            var dept = Guid.NewGuid();
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = "QA", OrganizationId = org });
            db.UserProfiles.Add(new UserProfile { Id = Guid.NewGuid(), UserId = user, Name = "Ahlem Test", Email = "secret@test", Role = "user", Poste = "x", Equipe = "x", DepartmentId = dept });
            return Task.CompletedTask;
        });

        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "user");
        var raw = await client.GetStringAsync("/api/people/directory");
        var list = JsonDocument.Parse(raw).RootElement.EnumerateArray().ToArray();

        var me = list.Single(p => p.GetProperty("userId").GetString() == user);
        Assert.Equal("Ahlem Test", me.GetProperty("name").GetString());
        Assert.Equal("QA", me.GetProperty("departmentCode").GetString());
        Assert.DoesNotContain("secret@test", raw);
    }
}
