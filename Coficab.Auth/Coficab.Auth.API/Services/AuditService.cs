using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;

namespace Coficab.Auth.API.Services;

public class AuditService
{
    private readonly AppDbContext _db;

    public AuditService(AppDbContext db) => _db = db;

    public async Task LogAsync(
        string action,
        string targetEmail,
        string? actorId = null,
        string actorEmail = "system",
        string? detail = null)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            Action = action,
            TargetEmail = targetEmail,
            ActorId = actorId,
            ActorEmail = actorEmail,
            Detail = detail,
            Timestamp = DateTimeOffset.UtcNow,
        });
        await _db.SaveChangesAsync();
    }
}