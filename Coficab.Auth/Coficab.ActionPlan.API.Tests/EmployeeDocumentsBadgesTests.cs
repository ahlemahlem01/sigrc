using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
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

    [Fact]
    public async Task MoveToDepartment_ChangesOnlyTheDepartment_AndRefusesArchivedOrUnknownOnes()
    {
        var orgId = Guid.NewGuid();
        var from = Guid.NewGuid();
        var to = Guid.NewGuid();
        var archived = Guid.NewGuid();
        var user = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = orgId, Name = "Org move", Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = from, Name = "Production move", Code = "PM", OrganizationId = orgId });
            db.Departments.Add(new Department { Id = to, Name = "Qualite move", Code = "QM", OrganizationId = orgId });
            db.Departments.Add(new Department { Id = archived, Name = "Ancien", Code = "OLD", OrganizationId = orgId, IsArchived = true });
            db.UserProfiles.Add(new UserProfile { UserId = user, Name = "Mover", Email = "mover@test", Poste = "Operateur", Equipe = "A", DepartmentId = from });
            return Task.CompletedTask;
        });

        Assert.Equal(HttpStatusCode.Forbidden,
            (await ClientAs("user").PutAsJsonAsync($"/api/admin/employees/profiles/{user}/department", new { departmentId = to })).StatusCode);

        var ok = await ClientAs("admin").PutAsJsonAsync($"/api/admin/employees/profiles/{user}/department", new { departmentId = to });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        var profile = await ClientAs("admin").GetFromJsonAsync<JsonElement>($"/api/admin/employees/profiles/{user}", JsonOpts);
        Assert.Equal("Qualite move", profile.GetProperty("department").GetString());
        Assert.Equal(to.ToString(), profile.GetProperty("departmentId").GetString(), ignoreCase: true);
        Assert.Equal("Mover", profile.GetProperty("name").GetString());       // nothing else changed
        Assert.Equal("Operateur", profile.GetProperty("poste").GetString());

        Assert.Equal(HttpStatusCode.BadRequest,
            (await ClientAs("admin").PutAsJsonAsync($"/api/admin/employees/profiles/{user}/department", new { departmentId = archived })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await ClientAs("admin").PutAsJsonAsync($"/api/admin/employees/profiles/{user}/department", new { departmentId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await ClientAs("admin").PutAsJsonAsync($"/api/admin/employees/profiles/{Guid.NewGuid()}/department", new { departmentId = to })).StatusCode);
    }

    [Fact]
    public async Task DashboardSummary_CountsLateByDeadline_AndListsClaimsWithoutDeadlineSeparately()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim { Title = $"late-{tag}", StatusCode = "OUVERTE", Deadline = DateTime.UtcNow.AddDays(-9), DetectionDate = DateTime.UtcNow.AddDays(-60), CreatedById = Me });
            db.Claims.Add(new Claim { Title = $"upcoming-{tag}", StatusCode = "OUVERTE", Deadline = DateTime.UtcNow.AddDays(9), DetectionDate = DateTime.UtcNow.AddDays(-60), CreatedById = Me });
            db.Claims.Add(new Claim { Title = $"nodeadline-{tag}", StatusCode = "OUVERTE", Deadline = null, DetectionDate = DateTime.UtcNow.AddDays(-400), CreatedById = Me });
            db.Claims.Add(new Claim { Title = $"closed-{tag}", StatusCode = "CLOTUREE", Deadline = DateTime.UtcNow.AddDays(-30), DetectionDate = DateTime.UtcNow.AddDays(-90), CreatedById = Me });
            return Task.CompletedTask;
        });

        var summary = await ClientAs("admin").GetFromJsonAsync<JsonElement>("/api/dashboard/summary", JsonOpts);
        var claims = summary.GetProperty("claims");

        var late = claims.GetProperty("top5Late").EnumerateArray().Select(c => c.GetProperty("title").GetString()).ToList();
        Assert.Contains($"late-{tag}", late);
        Assert.DoesNotContain($"upcoming-{tag}", late);
        Assert.DoesNotContain($"nodeadline-{tag}", late);          // never late without a deadline
        Assert.DoesNotContain($"closed-{tag}", late);

        var noDeadline = claims.GetProperty("top5NoDeadline").EnumerateArray().Select(c => c.GetProperty("title").GetString()).ToList();
        Assert.Contains($"nodeadline-{tag}", noDeadline);
        Assert.True(claims.GetProperty("kpis").GetProperty("noDeadline").GetInt32() >= 1);
    }

    [Fact]
    public async Task Overview_CountsTheValidationQueue_OnTimeClosures_AndRanksDefects()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        var defect = $"Defect-{tag}";
        var admin = ClientAs("admin");
        var before = await admin.GetFromJsonAsync<JsonElement>("/api/dashboard/overview?days=90", JsonOpts);

        await _factory.SeedAsync(db =>
        {
            var now = DateTime.UtcNow;
            // only employees count in the workload: the caller needs a (non-admin) profile
            if (!db.UserProfiles.Any(p => p.UserId == Me))
                db.UserProfiles.Add(new UserProfile { UserId = Me, Name = "Overview tester", Email = "overview.tester@test", Role = "user", Poste = "Operateur", Equipe = "A" });
            db.Claims.Add(new Claim { Title = $"ov1-{tag}", DefectType = defect, CreatedById = Me, StatusCode = "PENDING_VALIDATION", DetectionDate = now.AddDays(-5), CreatedAt = now.AddDays(-5), ProducedQuantity = 1000, DefectiveQuantity = 10 });
            db.Claims.Add(new Claim { Title = $"ov2-{tag}", DefectType = defect, CreatedById = Me, StatusCode = "PENDING_VALIDATION", DetectionDate = now.AddDays(-4), CreatedAt = now.AddDays(-4), AssignedToId = Me });
            db.Claims.Add(new Claim { Title = $"ov3-{tag}", DefectType = defect, CreatedById = Me, StatusCode = "CLOTUREE", DetectionDate = now.AddDays(-20), CreatedAt = now.AddDays(-20), CompletedAt = now.AddDays(-10), IsOnTime = true, AssignedToId = Me });
            db.Claims.Add(new Claim { Title = $"ov4-{tag}", DefectType = defect, CreatedById = Me, StatusCode = "CLOTUREE", DetectionDate = now.AddDays(-20), CreatedAt = now.AddDays(-20), CompletedAt = now.AddDays(-9), IsOnTime = false, AssignedToId = Me });
            return Task.CompletedTask;
        });

        var after = await admin.GetFromJsonAsync<JsonElement>("/api/dashboard/overview?days=90", JsonOpts);
        int Delta(string a, string b) =>
            after.GetProperty(a).GetProperty(b).GetInt32() - before.GetProperty(a).GetProperty(b).GetInt32();

        Assert.Equal(2, Delta("actions", "pendingValidation"));
        Assert.Equal(1, Delta("actions", "unassigned"));              // only the first one has no assignee
        Assert.Equal(2, Delta("headline", "closedInPeriod"));
        Assert.Equal(1, Delta("headline", "onTimeCount"));
        Assert.Equal(2, Delta("headline", "onTimeBase"));

        var top = after.GetProperty("problems").GetProperty("topDefects").EnumerateArray()
            .FirstOrDefault(d => d.GetProperty("name").GetString() == defect);
        Assert.Equal(JsonValueKind.Object, top.ValueKind);          // the 4 claims of this test make it a top defect
        Assert.Equal(4, top.GetProperty("count").GetInt32());

        // to watch this week: the 8D queue and the workload are part of the answer
        Assert.True(after.GetProperty("watch").GetProperty("eightD").GetProperty("byStep").GetArrayLength() == 8);
        Assert.True(after.GetProperty("watch").GetProperty("workload").GetProperty("people").GetInt32() >= 1);
        Assert.True(after.GetProperty("watch").GetProperty("recurrence").GetProperty("repeatedLots").GetInt32() >= 0);
        Assert.True(after.GetProperty("watch").GetProperty("workload").TryGetProperty("overloaded", out _));
        Assert.Equal(6, after.GetProperty("months").GetArrayLength());
        Assert.Equal(85, after.GetProperty("targets").GetProperty("onTimeGreen").GetDouble());
    }

    [Fact]
    public async Task Overview_IsForAdminsOnly()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await ClientAs("user").GetAsync("/api/dashboard/overview")).StatusCode);
    }

    [Fact]
    public async Task Overview_AttributesClaimsToOrganizations_AndCanBeFilteredByOne()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        var deptA = Guid.NewGuid();
        var deptB = Guid.NewGuid();
        var alice = Guid.NewGuid().ToString();
        var bob = Guid.NewGuid().ToString();
        await _factory.SeedAsync(db =>
        {
            var now = DateTime.UtcNow;
            db.Organizations.Add(new Organization { Id = orgA, Name = $"OrgA-{tag}", Type = OrganizationType.Local });
            db.Organizations.Add(new Organization { Id = orgB, Name = $"OrgB-{tag}", Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = deptA, Name = "Prod", Code = $"PA{tag}", OrganizationId = orgA });
            db.Departments.Add(new Department { Id = deptB, Name = "Prod", Code = $"PB{tag}", OrganizationId = orgB });
            db.UserProfiles.Add(new UserProfile { UserId = alice, Name = "Alice", Email = $"alice{tag}@t", Role = "user", Poste = "P", Equipe = "A", DepartmentId = deptA });
            db.UserProfiles.Add(new UserProfile { UserId = bob, Name = "Bob", Email = $"bob{tag}@t", Role = "user", Poste = "P", Equipe = "A", DepartmentId = deptB });
            // org A: one late claim and one without deadline; org B: one open claim with a future deadline
            db.Claims.Add(new Claim { Title = $"a1-{tag}", StatusCode = "OUVERTE", AssignedToId = alice, CreatedById = Me, Deadline = now.AddDays(-5), DetectionDate = now.AddDays(-30), CreatedAt = now.AddDays(-30) });
            db.Claims.Add(new Claim { Title = $"a2-{tag}", StatusCode = "OUVERTE", AssignedToId = alice, CreatedById = Me, Deadline = null, DetectionDate = now.AddDays(-30), CreatedAt = now.AddDays(-30) });
            db.Claims.Add(new Claim { Title = $"b1-{tag}", StatusCode = "OUVERTE", AssignedToId = bob, CreatedById = Me, Deadline = now.AddDays(10), DetectionDate = now.AddDays(-3), CreatedAt = now.AddDays(-3) });
            return Task.CompletedTask;
        });

        var admin = ClientAs("admin");
        var all = await admin.GetFromJsonAsync<JsonElement>("/api/dashboard/overview?days=90", JsonOpts);
        JsonElement Row(string name) => all.GetProperty("organizations").EnumerateArray()
            .First(o => o.GetProperty("name").GetString() == name);

        var a = Row($"OrgA-{tag}");
        var b = Row($"OrgB-{tag}");
        Assert.Equal(2, a.GetProperty("openClaims").GetInt32());
        Assert.Equal(1, a.GetProperty("lateClaims").GetInt32());
        Assert.Equal(1, a.GetProperty("noDeadline").GetInt32());
        Assert.Equal(1, a.GetProperty("employees").GetInt32());
        Assert.Equal(1, b.GetProperty("openClaims").GetInt32());
        Assert.Equal(0, b.GetProperty("lateClaims").GetInt32());

        // filtering on one organization narrows the headline figures to it
        var onlyA = await admin.GetFromJsonAsync<JsonElement>($"/api/dashboard/overview?days=90&organizationId={orgA}", JsonOpts);
        Assert.Equal(2, onlyA.GetProperty("headline").GetProperty("openClaims").GetInt32());
        Assert.Equal(1, onlyA.GetProperty("actions").GetProperty("lateClaims").GetInt32());
        Assert.Equal($"OrgA-{tag}", onlyA.GetProperty("scope").GetProperty("organizationName").GetString());
        // ... while the comparison still lists the other organizations
        Assert.Contains(onlyA.GetProperty("organizations").EnumerateArray(), o => o.GetProperty("name").GetString() == $"OrgB-{tag}");
    }

    [Fact]
    public async Task Overview_ListsTheMostUrgentClaimsFirst_SeverityThenDelay_NeverWithoutDeadline()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        await _factory.SeedAsync(db =>
        {
            var now = DateTime.UtcNow;
            db.Claims.Add(new Claim { Title = $"urgent-b-{tag}", Severity = "CRITICAL", StatusCode = "OUVERTE", CreatedById = Me, Deadline = now.AddDays(-5000), DetectionDate = now.AddDays(-6000), CreatedAt = now.AddDays(-6000) });
            db.Claims.Add(new Claim { Title = $"urgent-a-{tag}", Severity = "CRITICAL", StatusCode = "OUVERTE", CreatedById = Me, Deadline = now.AddDays(-5001), DetectionDate = now.AddDays(-6000), CreatedAt = now.AddDays(-6000) });
            db.Claims.Add(new Claim { Title = $"low-{tag}", Severity = "LOW", StatusCode = "OUVERTE", CreatedById = Me, Deadline = now.AddDays(-9000), DetectionDate = now.AddDays(-9500), CreatedAt = now.AddDays(-9500) });
            db.Claims.Add(new Claim { Title = $"nodeadline-{tag}", Severity = "CRITICAL", StatusCode = "OUVERTE", CreatedById = Me, Deadline = null, DetectionDate = now.AddDays(-9900), CreatedAt = now.AddDays(-9900) });
            return Task.CompletedTask;
        });

        var overview = await ClientAs("admin").GetFromJsonAsync<JsonElement>("/api/dashboard/overview?days=90", JsonOpts);
        var titles = overview.GetProperty("priority").EnumerateArray().Select(c => c.GetProperty("title").GetString()).ToList();

        Assert.True(titles.Count <= 5);
        Assert.Equal($"urgent-a-{tag}", titles[0]);                  // critical, the most overdue of the two
        Assert.Equal($"urgent-b-{tag}", titles[1]);
        Assert.DoesNotContain($"nodeadline-{tag}", titles);          // a claim without a deadline is never "late"
        var lowIndex = titles.IndexOf($"low-{tag}");
        Assert.True(lowIndex == -1 || lowIndex > 1);                  // severity beats the length of the delay
    }

    [Fact]
    public async Task OverviewTargets_CanBeChangedBySuperAdmin_AreValidated_AndDriveTheOverview()
    {
        var client = ClientAs("superadmin");
        var defaults = await client.GetFromJsonAsync<JsonElement>("/api/dashboard/overview/targets", JsonOpts);
        Assert.Equal(85, defaults.GetProperty("onTimeGreen").GetDouble());

        // an admin who is not superadmin can read the targets but not change them
        var asAdmin = await ClientAs("admin").PutAsJsonAsync("/api/dashboard/overview/targets",
            new { onTimeGreen = 90, onTimeOrange = 75, resolutionDays = 10, ppmTolerancePct = 5 });
        Assert.Equal(HttpStatusCode.Forbidden, asAdmin.StatusCode);

        // the orange level must stay under the green one
        var invalid = await client.PutAsJsonAsync("/api/dashboard/overview/targets",
            new { onTimeGreen = 80, onTimeOrange = 85, resolutionDays = 10, ppmTolerancePct = 5 });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal("onTimeOrderOrange", (await invalid.Content.ReadFromJsonAsync<JsonElement>(JsonOpts)).GetProperty("field").GetString());

        var saved = await client.PutAsJsonAsync("/api/dashboard/overview/targets",
            new { onTimeGreen = 90, onTimeOrange = 75, resolutionDays = 10, ppmTolerancePct = 5 });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var overview = await ClientAs("admin").GetFromJsonAsync<JsonElement>("/api/dashboard/overview?days=90", JsonOpts);
        Assert.Equal(90, overview.GetProperty("targets").GetProperty("onTimeGreen").GetDouble());
        Assert.Equal(10, overview.GetProperty("targets").GetProperty("resolutionDays").GetDouble());

        // back to the defaults
        var reset = await client.DeleteAsync("/api/dashboard/overview/targets");
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        var again = await client.GetFromJsonAsync<JsonElement>("/api/dashboard/overview/targets", JsonOpts);
        Assert.Equal(85, again.GetProperty("onTimeGreen").GetDouble());
    }
}
