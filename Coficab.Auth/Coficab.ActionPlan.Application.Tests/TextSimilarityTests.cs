using Coficab.ActionPlan.Application.ReferenceLists;

namespace Coficab.ActionPlan.Application.Tests;

public class TextSimilarityTests
{
    [Theory]
    [InlineData("Leoni", "LEONI")]
    [InlineData("Léoni", "leoni ")]
    [InlineData("Qualité", "qualite")]
    [InlineData("Ligne  1", "ligne-1")]
    public void SameValue_WrittenDifferently_IsTheSame(string a, string b) => Assert.True(TextSimilarity.Same(a, b));

    [Fact]
    public void DifferentValues_AreNotTheSame()
    {
        Assert.False(TextSimilarity.Same("Leoni", "Aptiv"));
        Assert.False(TextSimilarity.Same("", ""));
    }

    [Fact]
    public void Similar_FindsTypos_AndExtensions_ButNotUnrelatedNames()
    {
        var corpus = new[] { "Leoni", "Aptiv", "Yazaki", "Leoni Wiring Systems", "Valeo" };

        var typo = TextSimilarity.Similar("Leonii", corpus);
        Assert.Equal("Leoni", typo[0].Value);
        Assert.DoesNotContain(typo, t => t.Value is "Aptiv" or "Yazaki" or "Valeo");

        Assert.Contains(TextSimilarity.Similar("Leoni", corpus), t => t.Value == "Leoni Wiring Systems") ;
    }

    [Fact]
    public void Similar_PutsTheExactSpellingFirst_WithAScoreOfOne()
    {
        var found = TextSimilarity.Similar("léoni", new[] { "Leoni", "LEONI", "Leonie" });

        Assert.Equal(1.0, found[0].Score);
        Assert.Equal(1, found.Count(f => f.Score >= 1.0));   // the spellings are merged into one entry
    }

    [Fact]
    public void Merged_KeepsTheMostUsedSpelling()
    {
        var merged = TextSimilarity.Merged(new[] { "Leoni", "LEONI", "Leoni", "Aptiv" });

        Assert.Equal(new[] { "Aptiv", "Leoni" }, merged);
    }
}
