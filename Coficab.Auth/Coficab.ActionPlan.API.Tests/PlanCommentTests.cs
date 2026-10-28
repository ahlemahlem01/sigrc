using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Comments on an action plan: who can read and write, who can edit or archive, and who is notified.</summary>
public class PlanCommentTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private const string AdminId = "33333333-3333-3333-3333-333333333333";
    private const string StrangerId = "44444444-4444-4444-4444-444444444444";

    private readonly ActionPlanApiFactory _factory;

    public PlanCommentTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role, string? userId = null)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        if (userId != null) client.DefaultRequestHeaders.Add(TestAuthHandler.UserIdHeader, userId);
        return client;
    }

    private HttpClient Employee() => ClientAs("user");                       // the test employee (Me), assigned to the plan
    private HttpClient Admin() => ClientAs("admin", AdminId);
    private HttpClient Stranger() => ClientAs("user", StrangerId);

    private Mock<INotificationService> Notifications()
    {
        var mock = Mock.Get(_factory.Services.GetRequiredService<INotificationService>());
        mock.Invocations.Clear();
        return mock;
    }

    private async Task<Guid> SeedPlanAsync()
    {
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        var plan = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            foreach (var (id, name, role) in new[] { (Me, "Ahlem Employée", "user"), (AdminId, "Admin Qualité", "admin"), (StrangerId, "Autre Employé", "user") })
                if (!db.UserProfiles.Any(u => u.UserId == id))
                    db.UserProfiles.Add(new UserProfile { UserId = id, Name = name, Email = $"{id}@t", Role = role, Poste = "P", Equipe = "A", DepartmentId = dept });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = plan, Title = "Plan commenté", OrganizationId = org, DepartmentId = dept, OwnerId = AdminId, CreatedBy = AdminId, AssignedToId = Me,
                Type = ActionPlanType.PAC, Status = ActionPlanStatus.Ongoing,
            });
            return Task.CompletedTask;
        });
        return plan;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);

    [Fact]
    public async Task ACommentIsListedWithItsAuthorAndRole_AndTheOtherPeopleOfThePlanAreNotified_NotTheAuthor()
    {
        var plan = await SeedPlanAsync();
        var notes = Notifications();

        var posted = await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "  J'ai besoin d'un accès à la zone d'extrusion.  " });
        Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        var created = await Json(posted);
        Assert.Equal("J'ai besoin d'un accès à la zone d'extrusion.", created.GetProperty("body").GetString());          // trimmed
        Assert.Equal("employee", created.GetProperty("authorRole").GetString());
        Assert.True(created.GetProperty("mine").GetBoolean());

        // the administrator (owner and creator) is told, with the link of the admin pages; the author is not
        notes.Verify(n => n.NotifyAsync(AdminId, "plan_comment", It.IsAny<string>(), It.Is<string>(m => m.Contains("Ahlem Employée") && m.Contains("Plan commenté")), plan, $"/pages/front/action-plans/{plan}", null), Times.Once);
        notes.Verify(n => n.NotifyAsync(Me, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<string?>(), It.IsAny<Guid?>()), Times.Never);

        // the administrator answers: the employee is told, with the link of the employee pages
        notes = Notifications();
        var answer = await Admin().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "Accès accordé, voir avec le chef d'atelier." });
        Assert.Equal("admin", (await Json(answer)).GetProperty("authorRole").GetString());
        notes.Verify(n => n.NotifyAsync(Me, "plan_comment", It.IsAny<string>(), It.IsAny<string>(), plan, $"/pages/front/my-action-plans/{plan}", null), Times.Once);
        notes.Verify(n => n.NotifyAsync(AdminId, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<string?>(), It.IsAny<Guid?>()), Times.Never);

        var list = await Json(await Employee().GetAsync($"/api/ActionPlan/{plan}/comments"));
        Assert.Equal(2, list.GetArrayLength());
        Assert.Equal("Ahlem Employée", list[0].GetProperty("authorName").GetString());                                        // oldest first
        Assert.True(list[0].GetProperty("canEdit").GetBoolean());
        Assert.False(list[1].GetProperty("canEdit").GetBoolean());                                                           // not the author
        Assert.False(list[1].GetProperty("canDelete").GetBoolean());                                                         // an employee cannot remove an admin's comment

        // and it is part of the history of the plan
        var history = await Json(await Admin().GetAsync($"/api/ActionPlan/assigned/{plan}/history"));
        Assert.Contains(history.EnumerateArray(), e => e.GetProperty("actionType").GetString() == "comment_added");
    }

    [Fact]
    public async Task AnEmployeesCommentOnAPlanTheyOpenedThemselves_IsNotLeftUnread_TheAdministratorsAreTold()
    {
        var plan = await SeedPlanAsync();
        await _factory.SeedAsync(db =>
        {
            var p = db.ActionPlans.Single(x => x.Id == plan);
            p.OwnerId = Me; p.CreatedBy = Me;                                  // nobody else is involved
            return Task.CompletedTask;
        });
        var notes = Notifications();

        Assert.Equal(HttpStatusCode.OK, (await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "Une question pour la qualité." })).StatusCode);
        notes.Verify(n => n.NotifyAdminsAsync("plan_comment", It.IsAny<string>(), It.Is<string>(m => m.Contains("Une question pour la qualité.")), plan, null, $"/pages/front/action-plans/{plan}", Me), Times.Once);
    }

    [Fact]
    public async Task ThoseWhoDoNotWorkOnThePlan_CannotReadOrWrite()
    {
        var plan = await SeedPlanAsync();
        var stranger = Stranger();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/ActionPlan/{plan}/comments")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "coucou" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Admin().GetAsync($"/api/ActionPlan/{Guid.NewGuid()}/comments")).StatusCode);
    }

    [Fact]
    public async Task AnEmptyOrTooLongComment_IsRefused()
    {
        var plan = await SeedPlanAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "   " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = new string('x', 2001) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = new string('x', 2000) })).StatusCode);
    }

    [Fact]
    public async Task OnlyTheAuthorEdits_AndAnAdministratorCanArchiveAnyComment_WithoutDeletingIt()
    {
        var plan = await SeedPlanAsync();
        var id = (await Json(await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "version 1" }))).GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.Forbidden, (await Admin().PutAsJsonAsync($"/api/ActionPlan/{plan}/comments/{id}", new { body = "réécrit par l'admin" })).StatusCode);
        var edited = await Json(await Employee().PutAsJsonAsync($"/api/ActionPlan/{plan}/comments/{id}", new { body = "version 2" }));
        Assert.Equal("version 2", edited.GetProperty("body").GetString());
        Assert.NotEqual(JsonValueKind.Null, edited.GetProperty("editedAt").ValueKind);

        Assert.Equal(HttpStatusCode.NotFound, (await Stranger().DeleteAsync($"/api/ActionPlan/{plan}/comments/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Admin().DeleteAsync($"/api/ActionPlan/{plan}/comments/{id}")).StatusCode);
        Assert.Equal(0, (await Json(await Employee().GetAsync($"/api/ActionPlan/{plan}/comments"))).GetArrayLength());

        using var scope = _factory.Services.CreateScope();
        var row = await scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>().ActionPlanComments.AsNoTracking().SingleAsync(c => c.Id == id);
        Assert.True(row.IsArchived);                                                          // archived, never deleted
        Assert.Equal(AdminId, row.ArchivedBy);
        Assert.Equal("version 2", row.Body);
    }

    [Fact]
    public async Task APostIsNotLostWhenANotificationFails()
    {
        var plan = await SeedPlanAsync();
        var notes = Notifications();
        notes.Setup(n => n.NotifyAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<string?>(), It.IsAny<Guid?>()))
             .ThrowsAsync(new InvalidOperationException("push down"));
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await Employee().PostAsJsonAsync($"/api/ActionPlan/{plan}/comments", new { body = "malgré la panne" })).StatusCode);
            Assert.Equal(1, (await Json(await Employee().GetAsync($"/api/ActionPlan/{plan}/comments"))).GetArrayLength());
        }
        finally
        {
            notes.Reset();
            notes.Setup(n => n.NotifyAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<string?>(), It.IsAny<Guid?>())).Returns(Task.CompletedTask);
        }
    }
}
