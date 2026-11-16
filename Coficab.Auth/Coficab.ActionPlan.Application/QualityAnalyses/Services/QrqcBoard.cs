using System.Globalization;
using System.Text;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Escalation of a problem on the QRQC board: the longer it stays open, the higher the level that has to deal with it
/// (1 the employee in charge, 2 the administrator, 3 the superadmin: the three roles of the application). The delays are in minutes, shorter for the more severe problems.
/// </summary>
public static class QrqcEscalation
{
    /// <summary>Minutes open before level 2 and 3 (for a medium severity).</summary>
    public static readonly int[] DefaultMinutes = { 60, 240 };

    public static double SeverityFactor(string? severity) => (severity ?? string.Empty).Trim().ToUpperInvariant() switch
    {
        "CRITICAL" => 0.5,
        "HIGH" => 0.75,
        "LOW" => 2,
        _ => 1,
    };

    public static int Level(double minutesOpen, string? severity, int[]? minutes = null)
    {
        var steps = minutes is { Length: 2 } ? minutes : DefaultMinutes;
        var factor = SeverityFactor(severity);
        var level = 1;
        for (var i = 0; i < steps.Length; i++)
            if (minutesOpen >= steps[i] * factor) level = i + 2;
        return level;
    }

    /// <summary>The state of a line on the board: green nothing open, orange something open, red something at the last level (3).</summary>
    public static string LineState(IEnumerable<int> levels)
    {
        var list = levels.ToList();
        if (list.Count == 0) return "green";
        return list.Max() >= 3 ? "red" : "orange";
    }
}

/// <summary>Exchange format of the problems for SAP QM: one line per quality notification. Only the number (QMNUM) and the text (QMTXT) keep their SAP names; the other columns are named in plain French.</summary>
public static class QrqcSapExport
{
    public static readonly string[] Columns =
    {
        "Type", "QMNUM", "QMTXT", "Date", "Ligne", "Lot", "Priorité", "Code défaut", "Cause", "Action", "Statut SAP", "Statut SIGRC", "Niveau d'escalade", "Minutes ouvert",
    };

    /// <summary>Q3 = internal problem report, Q1 = customer complaint.</summary>
    public static string NotificationType(bool isInternal) => isInternal ? "Q3" : "Q1";

    /// <summary>SAP priority: 1 very high, 2 high, 3 medium, 4 low.</summary>
    public static string Priority(string? severity) => (severity ?? string.Empty).Trim().ToUpperInvariant() switch
    {
        "CRITICAL" => "1",
        "HIGH" => "2",
        "LOW" => "4",
        _ => "3",
    };

    /// <summary>OSNO outstanding, NOPR in process, NOCO completed.</summary>
    public static string Status(string? statusCode)
    {
        var s = (statusCode ?? string.Empty).Trim().ToUpperInvariant();
        if (s is "CLOTUREE" or "CLOSED" or "VALIDATED" or "ARCHIVED") return "NOCO";
        return s is "OUVERTE" or "DRAFT" or "" ? "OSNO" : "NOPR";
    }

    private static string Escape(string? value)
    {
        var text = (value ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();
        return text.IndexOfAny(new[] { ';', '"' }) >= 0 ? $"\"{text.Replace("\"", "\"\"")}\"" : text;
    }

    public static string Csv(IEnumerable<IReadOnlyList<string?>> rows)
    {
        var sb = new StringBuilder();
        sb.Append(string.Join(';', Columns)).Append("\r\n");
        foreach (var row in rows) sb.Append(string.Join(';', row.Select(Escape))).Append("\r\n");
        return sb.ToString();
    }

    public static string Date(DateTime date) => date.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
}
