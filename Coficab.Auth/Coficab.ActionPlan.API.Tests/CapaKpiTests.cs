using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>The two indicators of the specification: critical open actions and the efficacy rate of the closed plans.</summary>
public class CapaKpiTests : IClassFixture<ActionPlanApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly ActionPlanApiFactory _factory;

    public CapaKpiTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "admin");
        return client;
    }

    private static Claim NewClaim(string tag) => new()
    {
        Id = Guid.NewGuid(), Title = $"claim-{tag}", ClientId = "C", DefectType = "CUT_INSULATION", Severity = "HIGH", LotNumber = "L", Description = "d",
        StatusCode = "CLOTUREE", DetectionDate = DateTime.UtcNow.AddDays(-30), CreatedAt = DateTime.UtcNow.AddDays(-30),
    };

    private static EightDDossier Dossier(Guid claimId, int? lots, int? defects, bool validated) => new()
    {
        ClaimId = claimId, LotsChecked = lots, DefectsFound = defects, EffectivenessValidated = validated, StatusCode = "CLOSED",
    };

    [Fact]
    public async Task CriticalOpenActions_CountOnlyUnfinishedHighPriorityActionsOfOpenPlans()
    {
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            PlanAction Action(int priority, ActionProgress progress, DateTime? deadline, bool archived = false) => new()
            {
                Title = "a", Priority = priority, Progress = progress, Deadline = deadline, IsArchived = archived,
            };
            var open = new Core.Entities.ActionPlan
            {
                Title = "open", OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x", Type = ActionPlanType.PAC, Status = ActionPlanStatus.Ongoing, CreatedAt = now.AddDays(-10),
            };
            open.PlanActions.Add(Action(1, ActionProgress.NotStarted, now.AddDays(-4)));          // critical, late
            open.PlanActions.Add(Action(1, ActionProgress.NotStarted, now.AddDays(6)));           // critical, on time
            open.PlanActions.Add(Action(1, ActionProgress.Hundred, now.AddDays(-4)));             // critical but done
            open.PlanActions.Add(Action(1, ActionProgress.NotStarted, now.AddDays(-4), archived: true));
            open.PlanActions.Add(Action(2, ActionProgress.NotStarted, now.AddDays(-4)));          // not critical
            var closed = new Core.Entities.ActionPlan
            {
                Title = "closed", OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x", Type = ActionPlanType.PAC, Status = ActionPlanStatus.Closed, CreatedAt = now.AddDays(-20), CompletedAt = now.AddDays(-2),
            };
            closed.PlanActions.Add(Action(1, ActionProgress.NotStarted, now.AddDays(-4)));         // a closed plan carries no open action
            db.ActionPlans.AddRange(open, closed);
            return Task.CompletedTask;
        });

        var kpis = (await Admin().GetFromJsonAsync<JsonElement>($"/api/dashboard/capa-indicators?days=90&organizationIds={org}", JsonOpts)).GetProperty("kpis");
        Assert.Equal(3, kpis.GetProperty("openActions").GetInt32());
        Assert.Equal(2, kpis.GetProperty("criticalOpenActions").GetInt32());
        Assert.Equal(1, kpis.GetProperty("criticalLateActions").GetInt32());
    }

    [Fact]
    public async Task EfficacyRate_IsTheShareOfEvaluatedClosedPlansWhoseCheckFoundNoDefect()
    {
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var good = NewClaim("good");
        var failed = NewClaim("failed");
        var unchecked_ = NewClaim("unchecked");
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            db.Claims.AddRange(good, failed, unchecked_);
            db.EightDDossiers.AddRange(
                Dossier(good.Id, lots: 3, defects: 0, validated: true),         // evaluated and effective
                Dossier(failed.Id, lots: 2, defects: 1, validated: true),       // evaluated, a defect came back
                Dossier(unchecked_.Id, lots: null, defects: null, validated: false));   // no check made: not judged
            Core.Entities.ActionPlan Closed(string domain, Guid? claimId) => new()
            {
                Title = $"closed-{domain}", Domain = domain, OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x", Type = ActionPlanType.PAC,
                Status = ActionPlanStatus.Closed, CreatedAt = now.AddDays(-20), CompletedAt = now.AddDays(-3), IsOnTime = true, ClaimId = claimId,
            };
            db.ActionPlans.AddRange(Closed("HSE", good.Id), Closed("PRODUCTION", failed.Id), Closed("PRODUCTION", unchecked_.Id), Closed("PRODUCTION", null));
            return Task.CompletedTask;
        });

        var admin = Admin();
        var all = (await admin.GetFromJsonAsync<JsonElement>($"/api/dashboard/capa-indicators?days=90&organizationIds={org}", JsonOpts)).GetProperty("kpis");
        Assert.Equal(2, all.GetProperty("efficacyEvaluated").GetInt32());
        Assert.Equal(1, all.GetProperty("efficacyEffective").GetInt32());
        Assert.Equal(50, all.GetProperty("efficacyRate").GetProperty("current").GetDouble());
        Assert.Equal(JsonValueKind.Null, all.GetProperty("efficacyRate").GetProperty("previous").ValueKind);     // nothing to compare with before

        var hse = (await admin.GetFromJsonAsync<JsonElement>($"/api/dashboard/capa-indicators?days=90&organizationIds={org}&domain=HSE", JsonOpts)).GetProperty("kpis");
        Assert.Equal(100, hse.GetProperty("efficacyRate").GetProperty("current").GetDouble());                  // the domain filter applies to the new figures too
    }

    [Fact]
    public async Task TheIndicatorsCountThePlansPerWorkflowStep_AndThePlanDetailGivesItsStep()
    {
        var org = Guid.NewGuid();
        var dept = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var executing = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
            Core.Entities.ActionPlan Plan(ActionPlanStatus status, string? assignee, Guid? id = null) => new()
            {
                Id = id ?? Guid.NewGuid(), Title = $"wf-{status}", OrganizationId = org, DepartmentId = dept, OwnerId = "x", CreatedBy = "x", Type = ActionPlanType.PAC,
                Status = status, AssignedToId = assignee, CreatedAt = now.AddDays(-10), CompletedAt = status == ActionPlanStatus.Closed ? now.AddDays(-1) : null,
            };
            var running = Plan(ActionPlanStatus.Ongoing, "u", executing);
            running.PlanActions.Add(new PlanAction { Title = "a", Progress = ActionProgress.Fifty });
            db.ActionPlans.AddRange(Plan(ActionPlanStatus.Created, null), Plan(ActionPlanStatus.Ongoing, "u"), running, Plan(ActionPlanStatus.Closed, "u"));
            return Task.CompletedTask;
        });

        var admin = Admin();
        var dto = await admin.GetFromJsonAsync<JsonElement>($"/api/dashboard/capa-indicators?days=90&organizationIds={org}", JsonOpts);
        var stages = dto.GetProperty("byStage").EnumerateArray().ToDictionary(e => e.GetProperty("code").GetString()!, e => e.GetProperty("plans").GetInt32());
        Assert.Equal(6, stages.Count);
        Assert.Equal(1, stages["DETECTION"]);
        Assert.Equal(1, stages["ANALYSIS"]);
        Assert.Equal(1, stages["EXECUTION"]);
        Assert.Equal(0, stages["PLANNING"]);
        Assert.Equal(1, stages["CLOSURE"]);                                                  // closed in the period

        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/actionplan/{executing}/detail", JsonOpts);
        Assert.Equal(4, detail.GetProperty("workflowStage").GetInt32());
        Assert.Equal("QUALITY", detail.GetProperty("domain").GetString());
    }

    [Fact]
    public async Task WithoutAnyEvaluatedPlan_TheEfficacyRateIsNotAnInventedZero()
    {
        var org = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
            return Task.CompletedTask;
        });
        var kpis = (await Admin().GetFromJsonAsync<JsonElement>($"/api/dashboard/capa-indicators?days=90&organizationIds={org}", JsonOpts)).GetProperty("kpis");
        Assert.Equal(JsonValueKind.Null, kpis.GetProperty("efficacyRate").GetProperty("current").ValueKind);
        Assert.Equal(0, kpis.GetProperty("criticalOpenActions").GetInt32());
    }
}
