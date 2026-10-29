using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Coficab.Auth.API.Tests;

/// <summary>The catalog page creates a right from the references the project can enforce, and only the super administrator may.</summary>
public class PermissionCatalogTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;
    public PermissionCatalogTests(AuthApiFactory factory) => _factory = factory;

    private async Task<HttpClient> SignedInAs(string role)
    {
        var user = await _factory.CreateUserAsync();
        await _factory.WithUsersAsync(async (users, db) =>
        {
            if (!await db.Roles.AnyAsync(r => r.Name == role))
            {
                db.Roles.Add(new IdentityRole { Name = role, NormalizedName = role.ToUpperInvariant() });
                await db.SaveChangesAsync();
            }
            var found = await users.FindByEmailAsync(user.Email!);
            await users.AddToRoleAsync(found!, role);
            return 0;
        });
        var http = _factory.CreateClient();
        var login = await _factory.PasswordLoginAsync(http, user.Email!, AuthApiFactory.StrongPassword);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await AuthApiFactory.Json(login)).GetProperty("access_token").GetString());
        return http;
    }

    [Fact]
    public async Task ARightIsCreatedFromAnAvailableReference_AndThenLeavesTheList()
    {
        var admin = await SignedInAs("superadmin");

        var before = await admin.GetFromJsonAsync<List<string>>("/api/permissions/available-codes");
        // in the test database nothing is created yet: the list offers every right of the catalog that is created from this page
        Assert.Contains("assistant:unrestricted", before!);
        Assert.Contains("capa:extend_deadline", before!);
        Assert.Contains("capa:reassign", before!);
        Assert.Contains("8d:validate", before!);
        Assert.Contains("analysis:validate_fivewhy", before!);

        var created = await admin.PostAsJsonAsync("/api/permissions", new
        {
            name = "assistant:unrestricted", displayName = "Utiliser l'assistant sans restriction", description = "Réponses comme un administrateur", category = "Quality",
        });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);

        var after = await admin.GetFromJsonAsync<List<string>>("/api/permissions/available-codes");
        Assert.DoesNotContain("assistant:unrestricted", after!);

        // the same reference cannot be created twice, and an unknown one is refused
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/permissions", new { name = "assistant:unrestricted", displayName = "x", category = "Quality" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/permissions", new { name = "maintenance:close", displayName = "x", category = "Quality" })).StatusCode);
    }

    [Fact]
    public async Task OnlyTheSuperAdministrator_SeesTheReferencesOrCreatesARight()
    {
        var admin = await SignedInAs("admin");
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/permissions/available-codes")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/permissions", new { name = "assistant:unrestricted", displayName = "x", category = "Quality" })).StatusCode);
    }
}
