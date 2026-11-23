using System.Net;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A profile is deleted for good only when the person appears nowhere in the claims, plans and events: otherwise it is archived.</summary>
public class ProfileDeletionTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ProfileDeletionTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private HttpClient Admin() => As("admin");

    private static UserProfile Profile(string userId) =>
        new() { Id = Guid.NewGuid(), UserId = userId, Name = "Test " + userId[..6], Email = userId[..6] + "@t.com", Role = "user", Poste = "x", Equipe = "x" };

    [Fact]
    public async Task APersonWhoHasAClaim_IsNotDeleted_TheProfileStays()
    {
        var user = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            db.UserProfiles.Add(Profile(user));
            db.Claims.Add(new Claim { Title = "Isolation", CreatedById = "someone", AssignedToId = user, StatusCode = "PENDING_VALIDATION" });
            return Task.CompletedTask;
        });

        var response = await Admin().DeleteAsync($"/api/admin/employees/profiles/{user}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("profile_has_history", await response.Content.ReadAsStringAsync());
        var profile = await As("superadmin").GetAsync($"/api/admin/employees/profiles/{user}");
        Assert.Equal(HttpStatusCode.OK, profile.StatusCode);
    }

    [Fact]
    public async Task APersonWhoActedOnAClaim_IsNotDeleted()
    {
        var user = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            var claim = new Claim { Title = "Sertissage", CreatedById = "someone", StatusCode = "OPEN" };
            db.UserProfiles.Add(Profile(user));
            db.Claims.Add(claim);
            db.ClaimEvents.Add(new ClaimEvent { ClaimId = claim.Id, ActionType = "fivewhy_validated", ActorId = user });
            return Task.CompletedTask;
        });

        Assert.Equal(HttpStatusCode.Conflict, (await Admin().DeleteAsync($"/api/admin/employees/profiles/{user}")).StatusCode);
    }

    [Fact]
    public async Task APersonWithoutAnyHistory_MayBeDeleted()
    {
        var user = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            db.UserProfiles.Add(Profile(user));
            return Task.CompletedTask;
        });

        Assert.Equal(HttpStatusCode.NoContent, (await Admin().DeleteAsync($"/api/admin/employees/profiles/{user}")).StatusCode);
    }
}
