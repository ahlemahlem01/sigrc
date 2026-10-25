using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.Tests;

public class CvFeedbackTests
{
    private static DefectTypeResolver Resolver() => DefectTypeResolver.From(new[]
    {
        new ReferenceItem { ListKey = ReferenceListKeys.DefectType, Value = "CUT_INSULATION", IsActive = true },
        new ReferenceItem { ListKey = ReferenceListKeys.DefectType, Value = "BROKEN_STRANDS", IsActive = true },
    });

    [Fact]
    public void NoProposal_IsNotALearningSignal()
        => Assert.False(CvFeedback.ShouldLog(null, null, "CUT_INSULATION", Resolver()));

    [Fact]
    public void ConfidentProposalAccepted_IsNotLogged()
        => Assert.False(CvFeedback.ShouldLog("CUT_INSULATION", 0.92, "CUT_INSULATION", Resolver()));

    [Fact]
    public void OperatorCorrection_IsLogged()
        => Assert.True(CvFeedback.ShouldLog("CUT_INSULATION", 0.92, "BROKEN_STRANDS", Resolver()));

    [Fact]
    public void UnsureProposalAccepted_IsLogged()
        => Assert.True(CvFeedback.ShouldLog("CUT_INSULATION", CvFeedback.ConfidenceThreshold - 0.01, "CUT_INSULATION", Resolver()));

    [Fact]
    public void ProposalWithoutConfidence_IsLogged()
        => Assert.True(CvFeedback.ShouldLog("CUT_INSULATION", null, "CUT_INSULATION", Resolver()));

    [Theory]
    [InlineData("test", true)]
    [InlineData("Test2", true)]
    [InlineData("test 3", true)]
    [InlineData("TEST-01", true)]
    [InlineData("Contact intermittent", false)]
    [InlineData("Testeur cassé", false)]
    public void TestWordsAreRecognised(string value, bool expected)
        => Assert.Equal(expected, DefectTypeSuggestions.IsTestTerm(value));

    [Theory]
    [InlineData("cable.jpg", "CUT_INSULATION", true)]
    [InlineData(null, "CUT_INSULATION", true)]
    [InlineData("Copper_bloom_01.jpg", "COPPER_BLOOMING", false)]
    [InlineData("photo-cuivre.png", "COPPER_BLOOMING", false)]
    public void DemoMode_GivesAConfidentOrAnUnsureExample(string? fileName, string code, bool confident)
    {
        var (defect, confidence) = CvDemoPrediction.For(fileName);
        Assert.Equal(code, defect);
        Assert.Equal(confident, confidence >= CvFeedback.ConfidenceThreshold);
    }
}
