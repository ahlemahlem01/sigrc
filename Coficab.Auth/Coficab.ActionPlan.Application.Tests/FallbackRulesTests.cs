using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Core.DTOs.Claims;

namespace Coficab.ActionPlan.Application.Tests;

public class FallbackRulesTests
{
    [Fact]
    public void CapaSuggestionRules_BuildLocal_ProducesCorrectiveAndPreventive()
    {
        var dto = CapaSuggestionRules.BuildLocal(new SuggestCapaRequestDto
        {
            ClaimTitle = "Soudure WR-04",
            ProblemStatement = "Défaut soudure sur lot L1",
            RootCauseOccurrence = "Paramètre laser hors tolérance",
            RootCauseDetection = "Contrôle final non adapté au défaut"
        });

        Assert.Contains("Soudure WR-04", dto.PlanTitle);
        Assert.Equal(2, dto.Actions.Count);
        Assert.Contains(dto.Actions, a => a.Kind == "CORRECTIVE" && a.Branch == "OCCURRENCE");
        Assert.Contains(dto.Actions, a => a.Kind == "PREVENTIVE" && a.Branch == "DETECTION");
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
