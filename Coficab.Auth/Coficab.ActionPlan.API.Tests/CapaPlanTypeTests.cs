using Moq;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Core.DTOs.Claims;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>
/// The CAPA of the 5 Why is one plan with one type, chosen by the person: corrective (PAC), preventive (PAP) or improvement (PA).
/// The choice is required to generate the actions with the AI and to create the plan; every action follows the type of the plan.
/// </summary>
public class CapaPlanTypeTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public CapaPlanTypeTests(ActionPlanApiFactory factory) => _factory = factory;

    // ── the rules ──────────────────────────────────────────────────────────────────────────────
    [Theory]
    [InlineData(null, false, ActionPlanType.PAC)]
    [InlineData(1, false, ActionPlanType.PA)]
    [InlineData(2, false, ActionPlanType.PAC)]
    [InlineData(3, false, ActionPlanType.PAP)]
    [InlineData(9, false, ActionPlanType.PAC)]
    [InlineData(1, true, ActionPlanType.PAC)]
    [InlineData(3, true, ActionPlanType.PAC)]
    public void TheRule_NeverChangesAnInternalClaim(int? requested, bool internalClaim, ActionPlanType expected) =>
        Assert.Equal(expected, CapaPlanTypeRules.Resolve(requested, internalClaim));

    [Theory]
    [InlineData(null, false, true)]
    [InlineData(0, false, true)]
    [InlineData(9, false, true)]
    [InlineData(1, false, false)]
    [InlineData(2, false, false)]
    [InlineData(3, false, false)]
    [InlineData(null, true, false)]
    public void TheChoice_IsRequired_ExceptForAnInternalClaim(int? requested, bool internalClaim, bool missing) =>
        Assert.Equal(missing, CapaPlanTypeRules.ChoiceMissing(requested, internalClaim));

    [Theory]
    [InlineData(ActionPlanType.PAC, "CORRECTIVE")]
    [InlineData(ActionPlanType.PAP, "PREVENTIVE")]
    [InlineData(ActionPlanType.PA, "IMPROVEMENT")]
    public void EveryActionFollowsTheTypeOfThePlan(ActionPlanType type, string kind) => Assert.Equal(kind, CapaPlanTypeRules.KindOf(type));

    [Theory]
    [InlineData("PREVENTIVE", "Action préventive")]
    [InlineData("IMPROVEMENT", "Action d’amélioration")]
    [InlineData("CORRECTIVE", "Action corrective")]
    [InlineData(null, "Action corrective")]
    public void AnEmptyActionTitle_FollowsTheKind(string? kind, string expected) =>
        Assert.Equal(expected, CapaPlanTypeRules.DefaultActionTitle(kind));

    [Theory]
    [InlineData(1, "IMPROVEMENT")]
    [InlineData(2, "CORRECTIVE")]
    [InlineData(3, "PREVENTIVE")]
    public void TheLocalSuggestion_WritesTwoActionsOfTheChosenNature_OneOnEachCause(int planType, string kind)
    {
        var s = CapaSuggestionRules.BuildLocal(new SuggestCapaRequestDto { PlanType = planType, RootCauseOccurrence = "occ", RootCauseDetection = "det", ProblemStatement = "p", ClaimTitle = "t" });
        Assert.Equal(2, s.Actions.Count);
        Assert.All(s.Actions, a => Assert.Equal(kind, a.Kind));
        Assert.Equal(new[] { "OCCURRENCE", "DETECTION" }, s.Actions.Select(a => a.Branch));
    }

    [Fact]
    public void WhateverTheAiAnswered_TheActionsFollowThePlanType()
    {
        var ai = new SuggestCapaResponseDto
        {
            Actions = new List<SuggestedCapaActionDto>
            {
                new() { Kind = "PREVENTIVE", Branch = "weird", Title = "a" },
                new() { Kind = "CORRECTIVE", Branch = "", Title = "b" },
            },
        };
        CapaSuggestionRules.AlignWithPlanType(ai, ActionPlanType.PA);
        Assert.All(ai.Actions, a => Assert.Equal("IMPROVEMENT", a.Kind));
        Assert.Equal(new[] { "OCCURRENCE", "DETECTION" }, ai.Actions.Select(a => a.Branch));
    }

    // ── the endpoints ──────────────────────────────────────────────────────────────────────────
    private async Task<(Guid claimId, Guid deptId)> SeedAsync(bool internalClaim)
    {
        var claimId = Guid.NewGuid();
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "type de plan", DefectType = "Vrillage du câble", ClientId = "A", Severity = "HIGH", LotNumber = "L", Description = "d",
                StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow, CreatedById = TestAuthHandler.TestUserId.ToString(), IsInternal = internalClaim,
            });
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis
            {
                Id = Guid.NewGuid(), ClaimId = claimId, ProblemStatement = "p", StatusCode = "VALIDATED", IsValidated = true,
                RootCauseOccurrence = "La gamme ne définit pas la tension de frein.", RootCauseDetection = "Le plan de contrôle ne vérifie pas la torsion.",
                CreatedBy = TestAuthHandler.TestUserId.ToString(),
            });
            return Task.CompletedTask;
        });
        return (claimId, dept);
    }

    private HttpClient Client()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "admin");
        return client;
    }

    private List<Core.Entities.ActionPlan> PlansOf(Guid claimId)
    {
        using var scope = _factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>().ActionPlans.Where(p => p.ClaimId == claimId).ToList();
    }

    private List<string> ActionDescriptionsOf(Guid claimId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var planId = db.ActionPlans.Single(p => p.ClaimId == claimId).Id;
        return db.PlanActions.Where(a => a.ActionPlanId == planId).Select(a => a.Description ?? string.Empty).ToList();
    }

    private static object CreateBody(Guid deptId, int? planType) => new
    {
        planTitle = "CAPA test", planDescription = "d", departmentId = deptId, planType,
        actions = new[]
        {
            new { kind = "CORRECTIVE", branch = "OCCURRENCE", title = "Renforcer le process", description = "x", priority = 1, suggestedDeadlineDays = 10 },
            new { kind = "PREVENTIVE", branch = "DETECTION", title = "Renforcer le contrôle", description = "y", priority = 1, suggestedDeadlineDays = 14 },
        },
    };

    [Theory]
    [InlineData(1, ActionPlanType.PA, "IMPROVEMENT")]
    [InlineData(2, ActionPlanType.PAC, "CORRECTIVE")]
    [InlineData(3, ActionPlanType.PAP, "PREVENTIVE")]
    public async Task ThePlanHasTheChosenType_AndEveryActionFollowsIt(int requested, ActionPlanType expected, string kind)
    {
        var (claimId, deptId) = await SeedAsync(internalClaim: false);
        var r = await Client().PostAsJsonAsync($"/api/QualityAnalysis/5why/{claimId}/create-capa", CreateBody(deptId, requested));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(expected, PlansOf(claimId).Single().Type);
        Assert.All(ActionDescriptionsOf(claimId), d => Assert.StartsWith($"[{kind}/", d));
    }

    [Fact]
    public async Task SubmittingThePlan_TellsTheValidators()
    {
        var (claimId, deptId) = await SeedAsync(internalClaim: false);
        var r = await Client().PostAsJsonAsync($"/api/QualityAnalysis/5why/{claimId}/create-capa", CreateBody(deptId, 2));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var planId = PlansOf(claimId).Single().Id;
        Assert.Equal(PlanApprovalStatus.Pending, PlansOf(claimId).Single().ApprovalStatus);
        _factory.Notifier.Verify(n => n.NotifyValidatorsAsync("capa_submitted", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(),
            It.IsAny<Guid?>(), planId, claimId, It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(7)]
    public async Task WithoutAChoice_NoPlanIsCreated(int? requested)
    {
        var (claimId, deptId) = await SeedAsync(internalClaim: false);
        var r = await Client().PostAsJsonAsync($"/api/QualityAnalysis/5why/{claimId}/create-capa", CreateBody(deptId, requested));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal("planTypeRequired", (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Empty(PlansOf(claimId));
    }

    [Fact]
    public async Task AnInternalClaim_KeepsACorrectivePlan_WhateverWasAsked_AndNeedsNoChoice()
    {
        var (claimId, deptId) = await SeedAsync(internalClaim: true);
        var r = await Client().PostAsJsonAsync($"/api/QualityAnalysis/5why/{claimId}/create-capa", CreateBody(deptId, 1));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(ActionPlanType.PAC, PlansOf(claimId).Single().Type);
        Assert.All(ActionDescriptionsOf(claimId), d => Assert.StartsWith("[CORRECTIVE/", d));

        var (other, _) = await SeedAsync(internalClaim: true);
        var suggest = await Client().PostAsJsonAsync($"/api/QualityAnalysis/5why/{other}/suggest-capa", new { });
        Assert.Equal(HttpStatusCode.OK, suggest.StatusCode);
    }

    [Theory]
    [InlineData(1, "IMPROVEMENT")]
    [InlineData(2, "CORRECTIVE")]
    [InlineData(3, "PREVENTIVE")]
    public async Task TheSuggestion_NeedsTheChoice_AndFollowsIt(int planType, string kind)
    {
        var (claimId, _) = await SeedAsync(internalClaim: false);

        var missing = await Client().PostAsJsonAsync($"/api/QualityAnalysis/5why/{claimId}/suggest-capa", new { });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal("planTypeRequired", (await missing.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        var ok = await Client().PostAsJsonAsync($"/api/QualityAnalysis/5why/{claimId}/suggest-capa", new { planType });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var actions = (await ok.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("actions");
        Assert.Equal(2, actions.GetArrayLength());
        foreach (var a in actions.EnumerateArray()) Assert.Equal(kind, a.GetProperty("kind").GetString());
    }
}
