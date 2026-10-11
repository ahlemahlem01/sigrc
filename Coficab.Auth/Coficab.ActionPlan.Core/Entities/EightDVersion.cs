namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// One entry of the version history of an 8D dossier: a full snapshot of what the dossier held after a change.
/// Append-only: versions are never edited or deleted. D2/D4/D5 live in the claim, the 5 Why, the Ishikawa and the CAPA
/// plan, which keep their own history, so a snapshot covers the 8D dossier itself (D1, D3, D6, D7, D8 and its status).
/// </summary>
public class EightDVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DossierId { get; set; }
    public Guid ClaimId { get; set; }

    /// <summary>1, 2, 3... per dossier.</summary>
    public int VersionNumber { get; set; }

    /// <summary>baseline | saved | submitted | approved | rejected</summary>
    public string EventType { get; set; } = "saved";

    public DateTime SavedAt { get; set; } = DateTime.UtcNow;
    public string? SavedById { get; set; }

    public string StatusCode { get; set; } = "IN_PROGRESS";
    public int CurrentStep { get; set; } = 1;

    /// <summary>Comma-separated names of the fields that changed since the previous version.</summary>
    public string ChangedFields { get; set; } = string.Empty;

    /// <summary>Validation comment (approval / rejection).</summary>
    public string? Comment { get; set; }

    /// <summary>The full snapshot, as JSON text.</summary>
    public string SnapshotJson { get; set; } = "{}";
}

public static class EightDVersionEvents
{
    public const string Baseline = "baseline";
    public const string Saved = "saved";
    public const string Submitted = "submitted";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
}
