using Coficab.ActionPlan.Core.DTOs.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Coficab.ActionPlan.Application.Services;

internal static class EightDContainmentPlan
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static readonly string[] RequiredKinds = ["STOP_SHIP", "QUARANTINE", "SORT_100", "INFORM_CUSTOMER"];

    public static ParsedPlan Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return new ParsedPlan([], null, []);

        var trimmed = raw.TrimStart();
        if (trimmed.StartsWith('{'))
        {
            try
            {
                var plan = JsonSerializer.Deserialize<PlanJson>(trimmed, JsonOptions);
                if (plan?.Actions != null)
                    return new ParsedPlan(plan.Actions, plan.Notes, plan.FieldOriginals ?? []);
            }
            catch
            {
                // texte libre historique
            }
        }

        return new ParsedPlan([], raw, []);
    }

    public static string Serialize(
        IEnumerable<EightDContainmentActionDto>? incoming,
        string? notes,
        Dictionary<string, string>? fieldOriginals,
        IReadOnlyList<EightDContainmentActionDto>? existing = null)
    {
        var merged = MergeActions(existing, incoming);
        var plan = new PlanJson
        {
            V = 1,
            Notes = notes,
            Actions = merged,
            FieldOriginals = fieldOriginals ?? []
        };
        return JsonSerializer.Serialize(plan, JsonOptions);
    }

    public static Dictionary<string, string> CaptureOriginals(
        Dictionary<string, string>? previous,
        IReadOnlyDictionary<string, string?> current)
    {
        var next = new Dictionary<string, string>(previous ?? [], StringComparer.OrdinalIgnoreCase);
        foreach (var (key, value) in current)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (!next.ContainsKey(key))
                next[key] = value.Trim();
        }
        return next;
    }

    public static bool IsComplete(
        IReadOnlyList<EightDContainmentActionDto> actions,
        string? owner,
        bool verified)
    {
        if (string.IsNullOrWhiteSpace(owner) || !verified)
            return false;
        if (actions.Count == 0)
            return false;

        foreach (var kind in RequiredKinds)
        {
            var action = actions.FirstOrDefault(a =>
                string.Equals(a.Kind, kind, StringComparison.OrdinalIgnoreCase));
            if (action == null || !IsDone(action.Status))
                return false;
            if (kind == "SORT_100" && (action.QtyChecked ?? 0) <= 0)
                return false;
        }

        return true;
    }

    private static List<EightDContainmentActionDto> MergeActions(
        IReadOnlyList<EightDContainmentActionDto>? existing,
        IEnumerable<EightDContainmentActionDto>? incoming)
    {
        var byId = new Dictionary<string, EightDContainmentActionDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var prev in existing ?? [])
        {
            if (string.IsNullOrWhiteSpace(prev.Id)) continue;
            byId[prev.Id] = prev;
        }

        foreach (var raw in incoming ?? [])
        {
            var id = string.IsNullOrWhiteSpace(raw.Id) ? Guid.NewGuid().ToString("N")[..12] : raw.Id;
            byId.TryGetValue(id, out var prev);
            byId[id] = KeepOriginal(prev, Normalize(raw, id));
        }

        return byId.Values.ToList();
    }

    private static EightDContainmentActionDto KeepOriginal(EightDContainmentActionDto? prev, EightDContainmentActionDto next)
    {
        next.OriginalOwner = First(prev?.OriginalOwner, prev?.Owner, next.OriginalOwner, next.Owner);
        next.OriginalLocation = First(prev?.OriginalLocation, prev?.Location, next.OriginalLocation, next.Location);
        next.OriginalStatus = First(prev?.OriginalStatus, prev?.Status, next.OriginalStatus, next.Status);
        next.OriginalNotes = First(prev?.OriginalNotes, prev?.Notes, next.OriginalNotes, next.Notes);
        next.OriginalQtyChecked = prev?.OriginalQtyChecked ?? prev?.QtyChecked ?? next.OriginalQtyChecked ?? next.QtyChecked;
        next.OriginalQtyNok = prev?.OriginalQtyNok ?? prev?.QtyNok ?? next.OriginalQtyNok ?? next.QtyNok;
        return next;
    }

    private static string? First(params string?[] values)
        => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

    private static EightDContainmentActionDto Normalize(EightDContainmentActionDto a, string id) => new()
    {
        Id = id,
        Kind = string.IsNullOrWhiteSpace(a.Kind) ? "OTHER" : a.Kind.Trim().ToUpperInvariant(),
        Title = string.IsNullOrWhiteSpace(a.Title) ? "Action de confinement" : a.Title.Trim(),
        Owner = a.Owner,
        Location = a.Location,
        QtyChecked = a.QtyChecked,
        QtyNok = a.QtyNok,
        Status = string.IsNullOrWhiteSpace(a.Status) ? "TODO" : a.Status.Trim().ToUpperInvariant(),
        Notes = a.Notes,
        Required = a.Required || RequiredKinds.Contains((a.Kind ?? "").ToUpperInvariant()),
        OriginalOwner = a.OriginalOwner,
        OriginalLocation = a.OriginalLocation,
        OriginalStatus = a.OriginalStatus,
        OriginalNotes = a.OriginalNotes,
        OriginalQtyChecked = a.OriginalQtyChecked,
        OriginalQtyNok = a.OriginalQtyNok
    };

    private static bool IsDone(string? status)
        => string.Equals(status, "DONE", StringComparison.OrdinalIgnoreCase);

    internal sealed record ParsedPlan(
        List<EightDContainmentActionDto> Actions,
        string? Notes,
        Dictionary<string, string> FieldOriginals);

    private sealed class PlanJson
    {
        public int V { get; set; } = 1;
        public string? Notes { get; set; }
        public List<EightDContainmentActionDto> Actions { get; set; } = new();
        public Dictionary<string, string>? FieldOriginals { get; set; }
    }
}
