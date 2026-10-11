using System.ComponentModel.DataAnnotations;

namespace Coficab.Auth.API.Models;

public class AuditLog
{
    public int Id { get; set; }

    /// <summary>Who performed the action (user ID). Null = system (e.g. auto-lockout).</summary>
    public string? ActorId { get; set; }

    /// <summary>Display-friendly actor label stored at write time so it survives user deletion.</summary>
    [MaxLength(256)]
    public string ActorEmail { get; set; } = "system";

    /// <summary>The user/resource that was affected.</summary>
    [MaxLength(256)]
    public string TargetEmail { get; set; } = "";

    /// <summary>CREATE | UPDATE | DELETE | LOCKOUT | UNLOCK | RESET_PASSWORD</summary>
    [MaxLength(64)]
    public string Action { get; set; } = "";

    /// <summary>Optional human-readable detail (e.g. "Role changed from user → admin").</summary>
    [MaxLength(512)]
    public string? Detail { get; set; }

    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
}