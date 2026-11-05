using Coficab.ActionPlan.Application.QualityAnalyses.Services;

namespace Coficab.ActionPlan.Application.Tests;

public class GeminiVisionDefectTests
{
    private static readonly string[] Types = ["Étiquette manquante", "Soudure défectueuse"];

    [Fact]
    public void AListedDefect_IsKept_WithItsConfidence()
    {
        var r = GeminiVisionDefect.Parse("{\"defectType\":\"etiquette manquante\",\"confidence\":85,\"description\":\"Pas d'étiquette.\"}", Types);
        Assert.Equal("Étiquette manquante", r!.DefectType);   // spelling of the administrator's list
        Assert.Equal(0.85, r.Confidence);
    }

    [Fact]
    public void ADefectOutsideTheList_IsNeverProposed()
    {
        var r = GeminiVisionDefect.Parse("{\"defectType\":\"Rayure profonde\",\"confidence\":90,\"description\":\"Rayure.\"}", Types);
        Assert.Null(r!.DefectType);
        Assert.Equal(0, r.Confidence);
        Assert.Equal("Rayure.", r.Description);
    }

    [Fact]
    public void Garbage_GivesNoAnswer_AndFencedJsonIsAccepted()
    {
        Assert.Null(GeminiVisionDefect.Parse("not json", Types));
        var r = GeminiVisionDefect.Parse("```json\n{\"defectType\":null,\"confidence\":0.4,\"description\":\"RAS\"}\n```", Types);
        Assert.Null(r!.DefectType);
        Assert.Equal(0, r.Confidence);   // no defect, no confidence to show
    }

    [Fact]
    public void ThePromptListsTheCodes_AndAsksForTheLanguage()
    {
        var p = GeminiVisionDefect.BuildPrompt(Types, "it");
        Assert.Contains("- Soudure défectueuse", p);
        Assert.Contains("Italian", p);
    }
}
