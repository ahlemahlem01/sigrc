using System.Text;
using System.Text.Json;
using Coficab.ActionPlan.Application.ReferenceLists;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>What Gemini says it sees on a photo of a damaged cable: a defect code from the administrator's list (never an invented one), a short description and the confidence it states (0 to 1, self-reported, not calibrated).</summary>
public sealed record GeminiVisionResult(string? DefectType, double Confidence, string Description);

/// <summary>Prompt and answer reading for the Gemini photo analysis, kept apart from the HTTP call so that they can be tested.</summary>
public static class GeminiVisionDefect
{
    public static string BuildPrompt(IReadOnlyList<string> defectTypes, string language)
    {
        var lang = language switch { "en" => "English", "it" => "Italian", _ => "French" };
        var sb = new StringBuilder();
        sb.AppendLine("You are a quality inspector for automotive cables and wire harnesses (Coficab).");
        sb.AppendLine("Look at the photo and say which defect, if any, is visible.");
        sb.AppendLine("Choose defectType ONLY from this exact list, copied character for character, or null when none fits or nothing is visible:");
        foreach (var d in defectTypes) sb.AppendLine($"- {d}");
        sb.AppendLine("Do not guess beyond what is visible: when the photo is unclear or shows no defect, answer null and confidence 0.");
        sb.AppendLine("Reply with JSON only: {\"defectType\": string|null, \"confidence\": integer 0-100 (how sure you are of the defect), \"description\": string}.");
        sb.AppendLine($"description: one or two short sentences in {lang} saying what is visible and where, no markdown.");
        return sb.ToString();
    }

    /// <summary>Reads the model's JSON. A defect that is not on the list becomes null (it stays in the description only).</summary>
    public static GeminiVisionResult? Parse(string json, IReadOnlyList<string> defectTypes)
    {
        try
        {
            var start = json.IndexOf('{');
            var end = json.LastIndexOf('}');
            if (start < 0 || end <= start) return null;
            using var doc = JsonDocument.Parse(json[start..(end + 1)]);
            var root = doc.RootElement;

            string? defect = null;
            if (root.TryGetProperty("defectType", out var d) && d.ValueKind == JsonValueKind.String)
            {
                var key = DefectTypeResolver.Key(d.GetString());
                defect = defectTypes.FirstOrDefault(x => DefectTypeResolver.Key(x) == key);
            }

            var confidence = 0.0;
            if (root.TryGetProperty("confidence", out var c))
            {
                if (c.ValueKind == JsonValueKind.Number) confidence = c.GetDouble();
                else if (c.ValueKind == JsonValueKind.String && double.TryParse(c.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var parsed)) confidence = parsed;
            }
            if (confidence > 1) confidence /= 100;   // asked as 0-100, a 0-1 answer is accepted too
            confidence = Math.Clamp(confidence, 0, 1);

            var description = root.TryGetProperty("description", out var ds) && ds.ValueKind == JsonValueKind.String
                ? ds.GetString()!.Trim() : string.Empty;
            if (description.Length > 400) description = description[..400];

            return new GeminiVisionResult(defect, defect is null ? 0 : Math.Round(confidence, 2), description);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
