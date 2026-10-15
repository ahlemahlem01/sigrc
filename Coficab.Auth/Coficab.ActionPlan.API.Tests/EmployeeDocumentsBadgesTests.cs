using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>Admin-side documents and badges, the employee's own document list, and the notifications they trigger.</summary>
public class EmployeeDocumentsBadgesTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly string Me = TestAuthHandler.TestUserId.ToString();
    private const string Colleague = "22222222-2222-2222-2222-222222222222";
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly ActionPlanApiFactory _factory;

    public EmployeeDocumentsBadgesTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private Mock<INotificationService> Notifications()
    {
        var mock = Mock.Get(_factory.Services.GetRequiredService<INotificationService>());
        mock.Invocations.Clear();
        return mock;
    }

    [Theory]
    [InlineData(TestAuthHandler.Anonymous, HttpStatusCode.Unauthorized)]
    [InlineData("user", HttpStatusCode.Forbidden)]
    public async Task AdminEmployeeApi_RequiresAdmin(string role, HttpStatusCode expected)
    {
        var client = ClientAs(role);

        Assert.Equal(expected, (await client.GetAsync("/api/admin/employees/profiles")).StatusCode);
        Assert.Equal(expected, (await client.GetAsync("/api/admin/employees/documents")).StatusCode);
        Assert.Equal(expected, (await client.PostAsJsonAsync("/api/admin/employees/badges", new { userId = Me, name = "X" })).StatusCode);
    }

    [Fact]
    public async Task MyDocuments_ListsOnlyTheCallersDocuments()
    {
        var mine = Guid.NewGuid();
        var theirs = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Documents.Add(new Document { Id = mine, Name = "mine.pdf", Type = "PDF", UserId = Me, FilePath = "App_Data/documents/none.pdf" });
            db.Documents.Add(new Document { Id = theirs, Name = "theirs.pdf", Type = "PDF", UserId = Colleague, FilePath = "App_Data/documents/none.pdf" });
            return Task.CompletedTask;
        });

        var body = await ClientAs("user").GetFromJsonAsync<JsonElement>("/api/Documents/me", JsonOpts);
        var ids = body.GetProperty("data").EnumerateArray().Select(d => d.GetProperty("id").GetString()).ToList();

        Assert.Contains(mine.ToString(), ids);
        Assert.DoesNotContain(theirs.ToString(), ids);
    }

    [Fact]
    public async Task Download_SomeoneElsesDocument_IsHidden()
    {
        var theirs = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Documents.Add(new Document { Id = theirs, Name = "theirs.pdf", Type = "PDF", UserId = Colleague, FilePath = "App_Data/documents/none.pdf" });
            return Task.CompletedTask;
        });

        var response = await ClientAs("user").GetAsync($"/api/Documents/{theirs}/download");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("introuvable", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("C:/Windows/win.ini")]
    [InlineData("/etc/passwd")]
    [InlineData("App_Data/documents/../../appsettings.json")]
    [InlineData("/uploads/../../appsettings.json")]
    public void Storage_RefusesPathsOutsideTheDocumentFolders(string storedPath)
    {
        var env = _factory.Services.GetRequiredService<IWebHostEnvironment>();
        Assert.Null(DocumentStorage.Resolve(env, storedPath));
    }

    [Fact]
    public async Task Upload_RefusesScriptableFileTypes()
    {
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent("<script>alert(1)</script>"u8.ToArray()), "file", "page.html" },
            { new StringContent(Me), "userId" },
            { new StringContent("page.html"), "name" },
            { new StringContent("FILE"), "type" },
            { new StringContent("General"), "category" },
            { new StringContent("Admin"), "createdBy" },
        };

        var response = await ClientAs("admin").PostAsync("/api/admin/employees/documents/upload", form);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Upload_StoresPrivately_DownloadsForOwner_AndNotifiesEmployee()
    {
        var notifications = Notifications();
        var bytes = "%PDF-1.4 test"u8.ToArray();
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(bytes), "file", "contrat.pdf" },
            { new StringContent(Me), "userId" },
            { new StringContent("Contrat 2026"), "name" },
            { new StringContent("PDF"), "type" },
            { new StringContent("RH"), "category" },
            { new StringContent("Admin"), "createdBy" },
        };

        var upload = await ClientAs("admin").PostAsync("/api/admin/employees/documents/upload", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);

        var body = await upload.Content.ReadFromJsonAsync<JsonElement>(JsonOpts);
        var id = body.GetProperty("id").GetString()!;
        var storedPath = body.GetProperty("filePath").GetString()!;
        Assert.StartsWith("App_Data/documents/", storedPath);

        var physical = DocumentStorage.Resolve(_factory.Services.GetRequiredService<IWebHostEnvironment>(), storedPath)!;
        try
        {
            var download = await ClientAs("user").GetAsync($"/api/Documents/{id}/download");
            Assert.Equal(HttpStatusCode.OK, download.StatusCode);
            Assert.Equal(bytes, await download.Content.ReadAsByteArrayAsync());

            // The owner's download is recorded as "last opened".
            var mine = await ClientAs("user").GetFromJsonAsync<JsonElement>("/api/Documents/me", JsonOpts);
            var row = mine.GetProperty("data").EnumerateArray().First(d => d.GetProperty("id").GetString() == id);
            Assert.NotEqual("Never", row.GetProperty("lastViewed").GetString());
            Assert.Equal("Contrat 2026", row.GetProperty("name").GetString());

            notifications.Verify(n => n.NotifyAsync(
                Me, "document_added", It.IsAny<string>(), It.Is<string>(m => m.Contains("Contrat 2026")),
                null, "/documents", null), Times.Once);

            Assert.True(File.Exists(physical));
            var delete = await ClientAs("admin").DeleteAsync($"/api/admin/employees/documents/{id}");
            Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
            Assert.False(File.Exists(physical));
        }
        finally
        {
            if (File.Exists(physical)) File.Delete(physical);
        }
    }

    [Fact]
    public async Task AwardBadge_NotifiesEmployee()
    {
        var notifications = Notifications();

        var response = await ClientAs("admin").PostAsJsonAsync("/api/admin/employees/badges", new
        {
            userId = Me,
            name = "Premier Plan",
            description = "Bravo",
            icon = "first-plan",
            color = "#f59e0b",
            category = "first-plan",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        notifications.Verify(n => n.NotifyAsync(
            Me, "badge_awarded", It.IsAny<string>(), It.Is<string>(m => m.Contains("Premier Plan")),
            null, "/badges", null), Times.Once);
    }

    [Fact]
    public async Task AwardBadge_WithoutUser_IsRejected()
    {
        var response = await ClientAs("admin").PostAsJsonAsync("/api/admin/employees/badges", new { name = "Premier Plan" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AwardEarned_GivesSeveralBadges_AndNeverTheSameOneTwice()
    {
        var user = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            for (var i = 0; i < 5; i++)
                db.Claims.Add(new Claim
                {
                    Title = $"c{i}", AssignedToId = user, StatusCode = "CLOTUREE",
                    AssignedAt = DateTime.UtcNow.AddDays(-30 + i), Deadline = DateTime.UtcNow.AddDays(-5 + i),
                    CompletedAt = DateTime.UtcNow.AddDays(-10 + i), IsOnTime = true,
                });
            return Task.CompletedTask;
        });

        using var scope = _factory.Services.CreateScope();
        var badges = scope.ServiceProvider.GetRequiredService<IBadgeService>();

        var first = (await badges.AwardEarnedAsync(user)).Select(b => b.Name).ToList();
        Assert.Contains("Rapidité Bronze", first);
        Assert.Contains("Série solide", first);

        Assert.Empty(await badges.AwardEarnedAsync(user));   // nothing new: each badge is given once
        Assert.Equal(first.Count, (await badges.GetUserBadgesAsync(user)).Count());
    }

    [Fact]
    public async Task RecalculateBadges_IsAdminOnly_AndOnlyAdds()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").PostAsync("/api/admin/employees/badges/recalculate", null)).StatusCode);

        var user = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Title = "r1", AssignedToId = user, StatusCode = "CLOTUREE",
                CompletedAt = DateTime.UtcNow.AddDays(-3), IsOnTime = true,
            });
            return Task.CompletedTask;
        });

        var first = await ClientAs("admin").PostAsync("/api/admin/employees/badges/recalculate", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.True((await first.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("awarded").GetInt32() >= 1);

        var mine = await ClientAs("admin").GetFromJsonAsync<JsonElement>($"/api/admin/employees/badges/{user}", JsonOpts);
        Assert.Contains(mine.EnumerateArray(), b => b.GetProperty("name").GetString() == "Rapidité Bronze");

        var second = await ClientAs("admin").PostAsync("/api/admin/employees/badges/recalculate", null);
        Assert.Equal(0, (await second.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("awarded").GetInt32());
    }
}
