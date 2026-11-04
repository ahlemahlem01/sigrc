using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Core.DTOs.Claims;

namespace Coficab.ActionPlan.Application.Tests;

public class FiveWhyCoachChainTests
{
    private static ValidateFiveWhyStepRequestDto Step(string answer, string branch = "OCCURRENCE") => new()
    {
        StepNumber = 2, Branch = branch, ProblemStatement = "Coupure de la gaine sur la ligne EXT-01", ProposedAnswer = answer,
    };

    [Theory]
    [InlineData("L'opérateur s'est trompé lors du réglage de la filière")]
    [InlineData("Le technicien était distrait pendant le changement de bobine")]
    [InlineData("Le contrôleur a mal lu la fiche de contrôle du lot")]
    [InlineData("Une simple distraction au moment du chargement")]
    [InlineData("Non respect de la procédure de démarrage de la ligne")]
    [InlineData("L'opérateur n'a pas respecté la consigne de nettoyage")]
    [InlineData("Erreur de réglage de la température de la tête d'extrusion")]
    public void PeopleBlamedWithoutASystem_AreBlocked(string answer)
    {
        var result = FiveWhyCoachRules.EvaluateLocally(Step(answer));
        Assert.Equal("BLOCK", result.Severity);
        Assert.Contains("HUMAN_ERROR", result.Flags);
    }

    [Theory]
    [InlineData("Le profil de température de la tête d'extrusion dérive après deux heures de marche sans alarme")]
    [InlineData("La fiche de contrôle n'impose pas de critère d'acceptation chiffré pour l'épaisseur de gaine")]
    public void SystemCauses_AreNotBlocked(string answer)
    {
        Assert.NotEqual("BLOCK", FiveWhyCoachRules.EvaluateLocally(Step(answer)).Severity);
    }

    [Fact]
    public void Chain_IsEvaluatedStepByStep_AndARepeatedAnswerIsFlagged()
    {
        var cause = "La température de la filière dérive pendant la production du lot";
        var chain = new ValidateFiveWhyChainRequestDto
        {
            Branch = "OCCURRENCE",
            ProblemStatement = "Coupure de la gaine sur la ligne EXT-01",
            Steps = new()
            {
                new() { StepNumber = 1, Question = "Pourquoi ?", Answer = cause },
                new() { StepNumber = 2, Question = "Pourquoi ?", Answer = cause },
                new() { StepNumber = 3, Question = "Pourquoi ?", Answer = "L'opérateur s'est trompé lors du réglage" },
            },
        };

        var results = FiveWhyCoachRules.EvaluateChainLocally(chain).ToDictionary(x => x.StepNumber, x => x.Result);

        Assert.Equal(3, results.Count);
        Assert.Equal("WARN", results[2].Severity);
        Assert.Contains("CIRCULAR", results[2].Flags);
        Assert.Equal("BLOCK", results[3].Severity);
    }
}
