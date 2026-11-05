using Coficab.ActionPlan.Application.QualityAnalyses.Services;

namespace Coficab.ActionPlan.Application.Tests;

public class QrqcLogicTests
{
    [Theory]
    [InlineData(5, "MEDIUM", 1)]
    [InlineData(60, "MEDIUM", 2)]
    [InlineData(239, "MEDIUM", 2)]
    [InlineData(240, "MEDIUM", 3)]
    public void TheLongerAProblemStaysOpen_TheHigherTheLevel(int minutes, string severity, int level) =>
        Assert.Equal(level, QrqcEscalation.Level(minutes, severity));

    [Fact]
    public void ASevereProblemEscalatesSooner_AndALightOneLater()
    {
        Assert.Equal(2, QrqcEscalation.Level(30, "CRITICAL"));   // 60 min × 0.5
        Assert.Equal(1, QrqcEscalation.Level(30, "MEDIUM"));
        Assert.Equal(1, QrqcEscalation.Level(100, "LOW"));       // 60 min × 2 = 120
        Assert.Equal(2, QrqcEscalation.Level(120, "LOW"));
    }

    [Fact]
    public void TheDelaysCanBeSetByTheAdministrator() =>
        Assert.Equal(3, QrqcEscalation.Level(60, "MEDIUM", new[] { 10, 20 }));

    [Fact]
    public void ALineIsGreenWithNothingOpen_OrangeWithAProblem_RedAtTheLastLevel()
    {
        Assert.Equal("green", QrqcEscalation.LineState(Array.Empty<int>()));
        Assert.Equal("orange", QrqcEscalation.LineState(new[] { 1, 2 }));
        Assert.Equal("red", QrqcEscalation.LineState(new[] { 1, 3 }));
    }

    [Fact]
    public void SapExport_UsesTheNotificationTypes_PrioritiesAndStatusesOfSap()
    {
        Assert.Equal("Q3", QrqcSapExport.NotificationType(true));
        Assert.Equal("Q1", QrqcSapExport.NotificationType(false));
        Assert.Equal("1", QrqcSapExport.Priority("CRITICAL"));
        Assert.Equal("4", QrqcSapExport.Priority("LOW"));
        Assert.Equal("OSNO", QrqcSapExport.Status("OUVERTE"));
        Assert.Equal("NOPR", QrqcSapExport.Status("EN_ANALYSE"));
        Assert.Equal("NOCO", QrqcSapExport.Status("CLOTUREE"));
        Assert.Equal("20261104", QrqcSapExport.Date(new DateTime(2026, 11, 4)));
    }

    [Fact]
    public void SapExport_QuotesSemicolonsAndQuotes_AndKeepsOneLinePerProblem()
    {
        var csv = QrqcSapExport.Csv(new[] { (IReadOnlyList<string?>)new string?[] { "Q3", "R1", "Coupure; gaine \"ext\"", "20261104", null, "L1", "2", "x", "", null, "OSNO", "OUVERTE", "1", "5" } });
        var lines = csv.TrimEnd().Split("\r\n");
        Assert.Equal(2, lines.Length);
        Assert.StartsWith("QMART;QMNUM;QMTXT;", lines[0]);
        Assert.Contains("\"Coupure; gaine \"\"ext\"\"\"", lines[1]);
    }
}
