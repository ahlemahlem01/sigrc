using System.Text.Json;
using Coficab.ActionPlan.Core.DTOs.Claims;

namespace Coficab.ActionPlan.Application.Services;

/// <summary>What a version of an 8D dossier holds, and how two versions are compared.</summary>
public sealed class EightDSnapshot
{
    public string StatusCode { get; set; } = "IN_PROGRESS";
    public int CurrentStep { get; set; }

    // D1
    public string? ChampionName { get; set; }
    public string? TeamMembers { get; set; }

    // D3
    public string? ContainmentOwner { get; set; }
    public bool ContainmentVerified { get; set; }
    public string? ContainmentNotes { get; set; }
    public List<EightDContainmentActionDto> ContainmentActions { get; set; } = new();

    // D6
    public string? EffectivenessMethod { get; set; }
    public int? LotsChecked { get; set; }
    public int? DefectsFound { get; set; }
    public string? EffectivenessNotes { get; set; }
    public bool EffectivenessValidated { get; set; }

    // D7
    public string? PreventiveDescription { get; set; }
    public string? PreventiveScope { get; set; }
    public bool PreventiveStandardized { get; set; }

    // D8
    public string? CongratulationsNote { get; set; }
    public string? CustomerName { get; set; }

    // Validation
    public string? ValidationComment { get; set; }
}

public static class EightDVersioning
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Field name (camelCase, as in the JSON) to the 8D step it belongs to; 0 = status / validation.</summary>
    public static readonly IReadOnlyDictionary<string, int> StepOfField = new Dictionary<string, int>
    {
        ["statusCode"] = 0, ["currentStep"] = 0, ["validationComment"] = 0,
        ["championName"] = 1, ["teamMembers"] = 1,
        ["containmentOwner"] = 3, ["containmentVerified"] = 3, ["containmentNotes"] = 3, ["containmentActions"] = 3,
        ["effectivenessMethod"] = 6, ["lotsChecked"] = 6, ["defectsFound"] = 6, ["effectivenessNotes"] = 6, ["effectivenessValidated"] = 6,
        ["preventiveDescription"] = 7, ["preventiveScope"] = 7, ["preventiveStandardized"] = 7,
        ["congratulationsNote"] = 8, ["customerName"] = 8,
    };

    public static EightDSnapshot From(EightDDossierDto dossier) => new()
    {
        StatusCode = dossier.StatusCode,
        CurrentStep = dossier.CurrentStep,
        ChampionName = dossier.ChampionName,
        TeamMembers = dossier.TeamMembers,
        ContainmentOwner = dossier.ContainmentOwner,
        ContainmentVerified = dossier.ContainmentVerified,
        ContainmentNotes = dossier.ContainmentNotes,
        ContainmentActions = dossier.ContainmentActions,
        EffectivenessMethod = dossier.EffectivenessMethod,
        LotsChecked = dossier.LotsChecked,
        DefectsFound = dossier.DefectsFound,
        EffectivenessNotes = dossier.EffectivenessNotes,
        EffectivenessValidated = dossier.EffectivenessValidated,
        PreventiveDescription = dossier.PreventiveDescription,
        PreventiveScope = dossier.PreventiveScope,
        PreventiveStandardized = dossier.PreventiveStandardized,
        CongratulationsNote = dossier.CongratulationsNote,
        CustomerName = dossier.CustomerName,
        ValidationComment = dossier.ValidationComment,
    };

    public static string Serialize(EightDSnapshot snapshot) => JsonSerializer.Serialize(snapshot, Json);

    public static EightDSnapshot Deserialize(string json)
    {
        try { return JsonSerializer.Deserialize<EightDSnapshot>(json, Json) ?? new EightDSnapshot(); }
        catch (JsonException) { return new EightDSnapshot(); }
    }

    /// <summary>The fields whose value differs between two snapshots (previous = null: every non-empty field).</summary>
    public static List<EightDFieldChangeDto> Diff(EightDSnapshot? previous, EightDSnapshot current)
    {
        var after = Flatten(current);
        var before = previous == null ? new Dictionary<string, string?>() : Flatten(previous);
        var changes = new List<EightDFieldChangeDto>();

        foreach (var (field, step) in StepOfField)
        {
            before.TryGetValue(field, out var oldValue);
            after.TryGetValue(field, out var newValue);
            if (string.Equals(Normalize(oldValue), Normalize(newValue), StringComparison.Ordinal)) continue;
            changes.Add(new EightDFieldChangeDto { Field = field, Step = step, Before = oldValue, After = newValue });
        }
        return changes.OrderBy(c => c.Step == 0 ? 99 : c.Step).ThenBy(c => c.Field, StringComparer.Ordinal).ToList();
    }

    /// <summary>Each field as display text (null / empty / false / [] mean "nothing").</summary>
    private static Dictionary<string, string?> Flatten(EightDSnapshot s)
    {
        var element = JsonSerializer.SerializeToElement(s, Json);
        var values = new Dictionary<string, string?>();
        foreach (var property in element.EnumerateObject())
        {
            values[property.Name] = property.Value.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String => property.Value.GetString(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => property.Value.GetRawText(),
            };
        }
        return values;
    }

    private static string Normalize(string? value)
    {
        var v = (value ?? string.Empty).Trim();
        return v is "false" or "[]" ? string.Empty : v;
    }
}
