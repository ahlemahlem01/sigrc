using Coficab.ActionPlan.Application.QualityAnalyses.Services;

namespace Coficab.ActionPlan.Application.Tests;

/// <summary>The validated model is shown when it answers sensibly; in every other case the empirical percentiles stay.</summary>
public class ClaimEstimateSelectionTests
{
    private static ClaimResolutionEstimateDto Percentiles() => new()
    {
        DaysP50 = 12, DaysP80 = 18, SampleSize = 27, Method = "type_severity", DefectType = "Soudure", Severity = "HIGH", IsReliable = true,
    };

    [Fact]
    public void WithoutAModelAnswer_ThePercentilesAreKept()
    {
        var chosen = ClaimEstimateSelection.Choose(Percentiles(), null, "Soudure", "HIGH");
        Assert.Equal("type_severity", chosen!.Method);
        Assert.Equal(18, chosen.DaysP80);
    }

    [Fact]
    public void AValidatedModelAnswer_IsShown_WithTheMlMethodAndItsTrainingSize()
    {
        var chosen = ClaimEstimateSelection.Choose(Percentiles(), new DelayModelEstimate(11.24, 16.96, 12540), "Soudure", "HIGH");
        Assert.Equal(ClaimEstimateSelection.MlMethod, chosen!.Method);
        Assert.Equal(11.2, chosen.DaysP50);
        Assert.Equal(17.0, chosen.DaysP80);
        Assert.Equal(12540, chosen.SampleSize);
        Assert.True(chosen.IsReliable);
    }

    [Theory]
    [InlineData(double.NaN, 10)]
    [InlineData(-1, 10)]
    [InlineData(15, 10)]      // P80 below P50: the answer is not trusted
    public void ANonsensicalModelAnswer_FallsBackOnThePercentiles(double p50, double p80)
    {
        var chosen = ClaimEstimateSelection.Choose(Percentiles(), new DelayModelEstimate(p50, p80, 100), "Soudure", "HIGH");
        Assert.Equal("type_severity", chosen!.Method);
    }

    [Fact]
    public void WithNoHistoryAtAll_ThereIsNoEstimate_EvenIfTheModelAnswers()
    {
        // the service returns before asking the model when no claim was ever closed; Choose itself keeps the null percentiles only when the model is silent
        Assert.Null(ClaimEstimateSelection.Choose(null, null, "Soudure", "HIGH"));
    }
}
