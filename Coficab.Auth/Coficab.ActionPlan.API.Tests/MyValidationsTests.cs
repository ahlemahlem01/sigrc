using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The employee sees what waits for an administrator's decision, and can remind the validators once a day.</summary>
public class MyValidationsTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public MyValidationsTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<(Guid claimId, Guid analysisId)> SeedAsync(string reference, string assignedTo, string fiveWhyStatus = "PENDING_VALIDATION")
    {
        var claimId = Guid.NewGuid();
        var analysisId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "relance", Reference = reference, DefectType = "Vrillage du câble", ClientId = "A", Severity = "HIGH", LotNumber = "L", Description = "d",
                StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow, CreatedById = "someone-else", AssignedToId = assignedTo,
            });
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis { Id = analysisId, ClaimId = claimId, ProblemStatement = "p", StatusCode = fiveWhyStatus, CreatedBy = "someone-else" });
            return Task.CompletedTask;
        });
        return (claimId, analysisId);
    }

    private static JsonElement[] Rows(JsonElement list) => list.EnumerateArray().ToArray();

    [Fact]
    public async Task TheList_ShowsMyPendingFiveWhy_AndNotTheOthers()
    {
        var mine = await SeedAsync("REC-MV-0001", TestAuthHandler.TestUserId.ToString());
        var other = await SeedAsync("REC-MV-0002", Guid.NewGuid().ToString());
        var validated = await SeedAsync("REC-MV-0003", TestAuthHandler.TestUserId.ToString(), "VALIDATED");

        var list = Rows(await As("user").GetFromJsonAsync<JsonElement>("/api/my-validations"));

        Assert.Contains(list, r => r.GetProperty("id").GetGuid() == mine.analysisId && r.GetProperty("kind").GetString() == "fiveWhy" && r.GetProperty("canRemind").GetBoolean());
        Assert.DoesNotContain(list, r => r.GetProperty("id").GetGuid() == other.analysisId);
        Assert.DoesNotContain(list, r => r.GetProperty("id").GetGuid() == validated.analysisId);
    }

    [Fact]
    public async Task AReminder_TellsTheValidators_OnceADay()
    {
        var (claimId, analysisId) = await SeedAsync("REC-MV-0004", TestAuthHandler.TestUserId.ToString());
        var client = As("user");

        var first = await client.PostAsJsonAsync("/api/my-validations/remind", new { kind = "fiveWhy", targetId = analysisId });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        _factory.Notifier.Verify(n => n.NotifyValidatorsAsync("validation_reminder", It.IsAny<string>(),
            It.Is<string>(m => m.Contains("REC-MV-0004")), "analysis:validate_fivewhy", It.IsAny<Guid?>(), It.IsAny<Guid?>(), claimId,
            It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);

        var second = await client.PostAsJsonAsync("/api/my-validations/remind", new { kind = "fiveWhy", targetId = analysisId });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var row = Rows(await client.GetFromJsonAsync<JsonElement>("/api/my-validations")).Single(r => r.GetProperty("id").GetGuid() == analysisId);
        Assert.False(row.GetProperty("canRemind").GetBoolean());
        Assert.Equal(1, row.GetProperty("reminderCount").GetInt32());
    }

    [Fact]
    public async Task NoReminder_ForSomethingThatIsNotMineOrNotWaiting()
    {
        var other = await SeedAsync("REC-MV-0005", Guid.NewGuid().ToString());
        var done = await SeedAsync("REC-MV-0006", TestAuthHandler.TestUserId.ToString(), "VALIDATED");
        var client = As("user");
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/my-validations/remind", new { kind = "fiveWhy", targetId = other.analysisId })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/my-validations/remind", new { kind = "fiveWhy", targetId = done.analysisId })).StatusCode);
    }

    private async Task<Guid> SeedPlanAsync(int progress)
    {
        var (claimId, _) = await SeedAsync($"REC-MP-{Guid.NewGuid().ToString()[..6]}", "nobody", "VALIDATED");
        var planId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            var org = Guid.NewGuid();
            var dept = Guid.NewGuid();
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.ActionPlans.Add(new Core.Entities.ActionPlan
            {
                Id = planId, Title = "Plan CAPA", Status = progress > 0 ? ActionPlanStatus.Ongoing : ActionPlanStatus.Created, Progress = progress, Type = ActionPlanType.PAC,
                ClaimId = claimId, OrganizationId = org, DepartmentId = dept, OwnerId = "boss", AssignedToId = TestAuthHandler.TestUserId.ToString(),
            });
            return Task.CompletedTask;
        });
        return planId;
    }

    [Fact]
    public async Task AFinishedPlan_IsReadyToBeDecided_AndCanBeReminded()
    {
        var planId = await SeedPlanAsync(100);
        var client = As("user");
        var row = Rows(await client.GetFromJsonAsync<JsonElement>("/api/my-validations")).Single(r => r.GetProperty("id").GetGuid() == planId);
        Assert.Equal("capa", row.GetProperty("kind").GetString());
        Assert.True(row.GetProperty("ready").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/my-validations/remind", new { kind = "capa", targetId = planId })).StatusCode);
    }

    [Fact]
    public async Task APlanBeingCarriedOut_IsNotWaitingForAnyDecision_SoItIsNotListed()
    {
        var planId = await SeedPlanAsync(40);
        var list = Rows(await As("user").GetFromJsonAsync<JsonElement>("/api/my-validations"));
        Assert.DoesNotContain(list, r => r.GetProperty("id").GetGuid() == planId);
    }
}
