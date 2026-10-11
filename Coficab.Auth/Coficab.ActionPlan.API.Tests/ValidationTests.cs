using Coficab.ActionPlan.Core.DTOs.Claims;
using System.Net;
using System.Text.Json;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coficab.ActionPlan.API.Tests;

/// <summary>FluentValidation now runs in the MediatR pipeline: the rules must accept what the screens really send.</summary>
public class ValidationTests : IClassFixture<ActionPlanApiFactory>
{
    private readonly ActionPlanApiFactory _factory;
    public ValidationTests(ActionPlanApiFactory factory) => _factory = factory;

    private static CreateClaimCommand ValidClaim() => new()
    {
        Title = "Fil cassé", ClientId = "ACME", DefectType = "Coupure fil", Severity = ClaimSeverity.LOW,
        DetectionDate = DateTime.UtcNow, LotNumber = "L1", Description = "d", CreatedById = Guid.NewGuid(),
    };

    [Fact]
    public void CreateClaim_AcceptsLowSeverity_AndRejectsMissingLot()
    {
        var validator = new CreateClaimCommandValidator();
        Assert.True(validator.Validate(ValidClaim()).IsValid);

        var noLot = ValidClaim();
        noLot.LotNumber = " ";
        var result = validator.Validate(noLot);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateClaimCommand.LotNumber));
    }

    [Fact]
    public void CreateClaim_RejectsTooLongTitle_UnknownSeverity_AndMoreDefectiveThanProduced()
    {
        var validator = new CreateClaimCommandValidator();

        var longTitle = ValidClaim();
        longTitle.Title = new string('x', 201);
        Assert.False(validator.Validate(longTitle).IsValid);

        var badSeverity = ValidClaim();
        badSeverity.Severity = (ClaimSeverity)42;
        Assert.False(validator.Validate(badSeverity).IsValid);

        var quantities = ValidClaim();
        quantities.ProducedQuantity = 10;
        quantities.DefectiveQuantity = 11;
        Assert.False(validator.Validate(quantities).IsValid);
    }

    [Theory]
    [InlineData("HIGH", true)]
    [InlineData("critical", true)]
    [InlineData("Medium", true)]
    [InlineData(null, true)]
    [InlineData("URGENT", false)]
    public void UpdateClaim_SeverityIsCaseInsensitive(string? severity, bool valid)
    {
        var command = new UpdateClaimCommand { Id = Guid.NewGuid(), UpdatedById = Guid.NewGuid(), Severity = severity };
        Assert.Equal(valid, new UpdateClaimCommandValidator().Validate(command).IsValid);
    }

    [Fact]
    public void FiveWhyDraft_WithEmptyAnswers_IsAccepted_ButTooManyStepsIsNot()
    {
        var validator = new CreateOrUpdateFiveWhyCommandValidator();
        var draft = new CreateOrUpdateFiveWhyCommand { ClaimId = Guid.NewGuid(), UserId = Guid.NewGuid() };
        draft.Steps.Add(new FiveWhyStepDto { StepNumber = 1, Question = "Pourquoi ?", Answer = "" });
        Assert.True(validator.Validate(draft).IsValid);

        draft.Steps.Add(new FiveWhyStepDto { StepNumber = 9, Question = "q", Answer = "a" });
        Assert.False(validator.Validate(draft).IsValid);
    }

    [Fact]
    public void IshikawaCause_NeedsDescriptionWithinLimit()
    {
        var validator = new CreateIshikawaCauseCommandValidator();
        var claim = Guid.NewGuid();
        Assert.True(validator.Validate(new CreateIshikawaCauseCommand(claim, IshikawaCategory.Machine, "Usure", false, "u")).IsValid);
        Assert.False(validator.Validate(new CreateIshikawaCauseCommand(claim, IshikawaCategory.Machine, " ", false, "u")).IsValid);
        Assert.False(validator.Validate(new CreateIshikawaCauseCommand(claim, IshikawaCategory.Machine, new string('x', 501), false, "u")).IsValid);
    }

    [Fact]
    public async Task InvalidClaim_ReturnsBadRequest_WithMessageAndFieldErrors()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(TestAuthHandler.RoleHeader, "user");

        using var form = new MultipartFormDataContent
        {
            { new StringContent("Titre"), "Title" },
            { new StringContent("ACME"), "ClientId" },
            { new StringContent("Soudure"), "DefectType" },
            { new StringContent("HIGH"), "Severity" },
            { new StringContent("2026-01-01"), "DetectionDate" },
            { new StringContent("desc"), "Description" },
        };
        var response = await client.PostAsync("/api/QualityAnalysis/claims", form);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Contains("lot", doc.RootElement.GetProperty("message").GetString(), StringComparison.OrdinalIgnoreCase);
        Assert.Contains(doc.RootElement.GetProperty("errors").EnumerateArray(), e => e.GetProperty("field").GetString() == "LotNumber");
    }
}
