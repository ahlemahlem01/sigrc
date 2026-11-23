using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Core.DTOs.Claims;

namespace Coficab.ActionPlan.Application.Tests;

public class FallbackRulesTests
{
    [Theory]
    [InlineData(null, "CORRECTIVE")]   // the type is chosen by the person; without it the local rules fall back on the corrective plan
    [InlineData(2, "CORRECTIVE")]
    [InlineData(3, "PREVENTIVE")]
    [InlineData(1, "IMPROVEMENT")]
    public void CapaSuggestionRules_BuildLocal_WritesOneActionPerRootCause_OfTheNatureOfThePlan(int? planType, string kind)
    {
        var dto = CapaSuggestionRules.BuildLocal(new SuggestCapaRequestDto
        {
            PlanType = planType,
            ClaimTitle = "Soudure WR-04",
            ProblemStatement = "Défaut soudure sur lot L1",
            RootCauseOccurrence = "Paramètre laser hors tolérance",
            RootCauseDetection = "Contrôle final non adapté au défaut"
        });

        Assert.Contains("Soudure WR-04", dto.PlanTitle);
        Assert.Equal(2, dto.Actions.Count);
        Assert.Contains(dto.Actions, a => a.Kind == kind && a.Branch == "OCCURRENCE" && a.Description.Contains("Paramètre laser hors tolérance"));
        Assert.Contains(dto.Actions, a => a.Kind == kind && a.Branch == "DETECTION" && a.Description.Contains("Contrôle final non adapté au défaut"));
    }

    [Fact]
    public void FiveWhyCoachRules_BlocksHumanErrorAttribution()
    {
        var result = FiveWhyCoachRules.EvaluateLocally(new ValidateFiveWhyStepRequestDto
        {
            Branch = "OCCURRENCE",
            StepNumber = 2,
            ProposedAnswer = "Erreur humaine de l'opérateur qui n'a pas fait attention"
        });

        Assert.Contains("HUMAN_ERROR", result.Flags);
        Assert.Equal("BLOCK", result.Severity);
        Assert.False(result.IsAccepted);
    }

    [Fact]
    public void FiveWhyCoachRules_MergeWithLocal_ForcesBlockOnHumanError()
    {
        var request = new ValidateFiveWhyStepRequestDto
        {
            Branch = "DETECTION",
            StepNumber = 1,
            ProposedAnswer = "Le technicien n'a pas constaté le défaut sur la ligne"
        };
        var permissiveAi = new ValidateFiveWhyStepResponseDto
        {
            IsAccepted = true,
            Severity = "OK",
            Flags = new List<string>(),
            CoachMessage = "OK selon IA"
        };

        var merged = FiveWhyCoachRules.MergeWithLocal(request, permissiveAi);

        Assert.Equal("BLOCK", merged.Severity);
        Assert.False(merged.IsAccepted);
        Assert.Contains("HUMAN_ERROR", merged.Flags);
    }

    [Fact]
    public void FiveWhyCoachRules_EmptyAnswer_IsRejected()
    {
        var result = FiveWhyCoachRules.EvaluateLocally(new ValidateFiveWhyStepRequestDto
        {
            Branch = "OCCURRENCE",
            StepNumber = 1,
            ProposedAnswer = "court"
        });

        Assert.False(result.IsAccepted);
        Assert.Equal("BLOCK", result.Severity);
    }
}
