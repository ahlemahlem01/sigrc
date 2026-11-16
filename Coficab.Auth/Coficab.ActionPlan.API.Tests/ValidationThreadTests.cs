using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>
/// The administrator validates the root cause first (5 Why), then the action plan (CAPA, D5). The validation desk shows that thread:
/// where the plan of each claim stands, and the notification of a submitted 5 Why says which claim and which analyst.
/// </summary>
public class ValidationThreadTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ValidationThreadTests(ActionPlanApiFactory factory) => _factory = factory;

    [Theory]
    [InlineData(null, 0, "none")]
    [InlineData(ActionPlanStatus.Created, 0, "inProgress")]
    [InlineData(ActionPlanStatus.Ongoing, 60, "inProgress")]
    [InlineData(ActionPlanStatus.Ongoing, 90, "inProgress")]
    [InlineData(ActionPlanStatus.Ongoing, 100, "toValidate")]
    [InlineData(ActionPlanStatus.Closed, 100, "validated")]
    public void ThePlanStep_SaysWhereTheSecondValidationStands(ActionPlanStatus? status, int progress, string expected) =>
        Assert.Equal(expected, ValidationThread.PlanStep(status, progress));

    private HttpClient As(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<Guid> SeedPendingFiveWhyAsync(ActionPlanStatus? planStatus, int planProgress, string reference = "REC-TEST-0001", string analyst = "Ahlem Alaya")
    {
        var claimId = Guid.NewGuid();
        await _factory.SeedAsync(db =>
        {
            db.Claims.Add(new Claim
            {
                Id = claimId, Title = "fil de validation", Reference = reference, DefectType = "Vrillage du câble", ClientId = "A", Severity = "HIGH", LotNumber = "L", Description = "d",
                StatusCode = "EN_ANALYSE", DetectionDate = DateTime.UtcNow, CreatedById = TestAuthHandler.TestUserId.ToString(), AssignedToName = analyst,
            });
            db.FiveWhyAnalyses.Add(new FiveWhyAnalysis
            {
                Id = Guid.NewGuid(), ClaimId = claimId, ProblemStatement = "p", StatusCode = "PENDING_VALIDATION", CreatedBy = "u",
                RootCauseOccurrence = "La gamme ne définit pas la tension de frein.", RootCauseDetection = "Le plan de contrôle ne vérifie pas la torsion.",
            });
            if (planStatus.HasValue)
            {
                var org = Guid.NewGuid();
                var dept = Guid.NewGuid();
                db.Organizations.Add(new Organization { Id = org, Name = $"Org-{org:N}"[..12], Type = OrganizationType.Local });
                db.Departments.Add(new Department { Id = dept, Name = $"Dept-{dept:N}"[..12], Code = $"D{dept:N}"[..8], OrganizationId = org });
                db.ActionPlans.Add(new Core.Entities.ActionPlan
                {
                    Id = Guid.NewGuid(), Title = "CAPA", Status = planStatus.Value, Progress = planProgress, Type = ActionPlanType.PAC, ClaimId = claimId,
                    OrganizationId = org, DepartmentId = dept, OwnerId = TestAuthHandler.TestUserId.ToString(),
                });
            }
            return Task.CompletedTask;
        });
        return claimId;
    }

    private static JsonElement Row(JsonElement queue, Guid claimId) => queue.EnumerateArray().Single(r => r.GetProperty("claimId").GetGuid() == claimId);

    [Fact]
    public async Task TheQueue_ShowsTheSecondStep_AndBothRootCauses()
    {
        var none = await SeedPendingFiveWhyAsync(null, 0);
        var ongoing = await SeedPendingFiveWhyAsync(ActionPlanStatus.Ongoing, 40);
        var toValidate = await SeedPendingFiveWhyAsync(ActionPlanStatus.Ongoing, 100);

        var queue = await As("admin").GetFromJsonAsync<JsonElement>("/api/validations/five-why");

        Assert.Equal("none", Row(queue, none).GetProperty("planStep").GetString());
        var ongoingRow = Row(queue, ongoing);
        Assert.Equal("inProgress", ongoingRow.GetProperty("planStep").GetString());
        Assert.Equal(40, ongoingRow.GetProperty("planProgress").GetInt32());
        Assert.Equal("toValidate", Row(queue, toValidate).GetProperty("planStep").GetString());

        var row = Row(queue, none);
        Assert.Contains("tension de frein", row.GetProperty("rootCauseOccurrence").GetString());
        Assert.Contains("torsion", row.GetProperty("rootCauseDetection").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("planProgress").ValueKind);
    }

    [Fact]
    public async Task TheNotificationOfASubmitted5Why_SaysWhichClaim_WhichAnalyst_AndWhatComesNext()
    {
        var claimId = await SeedPendingFiveWhyAsync(null, 0, reference: "REC-TEST-4242", analyst: "Ahlem Alaya");
        Guid analysisId;
        using (var scope = _factory.Services.CreateScope())
            analysisId = scope.ServiceProvider.GetRequiredService<Coficab.ActionPlan.Infrastructure.Data.ActionPlanDbContext>().FiveWhyAnalyses.Single(a => a.ClaimId == claimId).Id;

        var submit = await As("user").PostAsJsonAsync("/api/QualityAnalysis/5why/validate",
            new { analysisId, claimId, isApproved = false, statusCode = "PENDING_VALIDATION" });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);

        _factory.Notifier.Verify(n => n.NotifyValidatorsAsync("five_why_pending_validation", "5 Why à valider",
            It.Is<string>(m => m.Contains("REC-TEST-4242") && m.Contains("Ahlem Alaya") && m.Contains("plan d'actions")), "analysis:validate_fivewhy", null, null, claimId,
            It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);
    }
}
