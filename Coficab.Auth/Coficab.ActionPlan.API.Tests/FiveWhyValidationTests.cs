using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>A 5 Why sent for validation reaches the validation desk and the administrators are told.</summary>
public class FiveWhyValidationTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public FiveWhyValidationTests(ActionPlanApiFactory factory) => _factory = factory;

    private HttpClient ClientAs(string role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, role);
        return client;
    }

    private async Task<(Guid claim, Guid analysis)> AddPendingFiveWhy(string title, string assignee)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ActionPlanDbContext>();
        var claim = Guid.NewGuid();
        var analysis = Guid.NewGuid();
        db.Claims.Add(new Claim
        {
            Id = claim, Title = title, DefectType = "Isolation", ClientId = "A", Severity = "HIGH", LotNumber = "L", Description = "d",
            StatusCode = "EN_ANALYSE", CreatedById = TestAuthHandler.TestUserId.ToString(), AssignedToId = assignee, DetectionDate = DateTime.UtcNow,
        });
        db.FiveWhyAnalyses.Add(new FiveWhyAnalysis { Id = analysis, ClaimId = claim, ProblemStatement = "p", StatusCode = "PENDING_VALIDATION", CreatedBy = "u" });
        await db.SaveChangesAsync();
        return (claim, analysis);
    }

    [Fact]
    public async Task ASubmittedFiveWhy_IsInTheQueue_AndTheAdministratorsAreNotified()
    {
        var (claim, analysis) = await AddPendingFiveWhy("Isolation endommagée", "someone-else");

        var submit = await ClientAs("user").PostAsJsonAsync("/api/QualityAnalysis/5why/validate",
            new { analysisId = analysis, claimId = claim, isApproved = false, statusCode = "PENDING_VALIDATION" });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);

        _factory.Notifier.Verify(n => n.NotifyAdminsAsync("five_why_pending_validation", "5 Why à valider",
            It.Is<string>(m => m.Contains("Isolation endommagée")), null, claim,
            It.Is<string?>(l => l != null && l.Contains("fivewhy")), It.IsAny<string?>()), Times.Once);

        using var queue = JsonDocument.Parse(await ClientAs("admin").GetStringAsync("/api/validations/five-why"));
        Assert.Contains(queue.RootElement.EnumerateArray(), r => r.GetProperty("claimId").GetGuid() == claim);
    }

    [Fact]
    public async Task AnApproval_NotifiesThePersonInCharge()
    {
        var (claim, analysis) = await AddPendingFiveWhy("Soudure", "ahlem-id");

        var approve = await ClientAs("admin").PostAsJsonAsync("/api/QualityAnalysis/5why/validate",
            new { analysisId = analysis, claimId = claim, isApproved = true, statusCode = "VALIDATED" });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        _factory.Notifier.Verify(n => n.NotifyAsync("ahlem-id", "five_why_validated", "5 Why validé",
            It.Is<string>(m => m.Contains("Soudure")), null, It.IsAny<string?>(), claim), Times.Once);
    }
}
