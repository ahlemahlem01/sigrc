using Coficab.ActionPlan.Application.Licences;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// Platform settings of the specification: the automatic logout delay (set by the local administrator) and the licences
/// (recorded by the superadmin, the supplier). The licence state is public: it is shown on the login page too.
/// </summary>
[ApiController]
[Route("api/system")]
public class SystemController : ControllerBase
{
    public const string IdleKey = "session.idleMinutes";
    public const int DefaultIdleMinutes = 30;

    private readonly ActionPlanDbContext _db;

    public SystemController(ActionPlanDbContext db) => _db = db;

    private string CurrentUserId() => User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value ?? "system";

    /// <summary>The licence state, without signing in (login page).</summary>
    [HttpGet("public")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicStatus(CancellationToken ct)
    {
        var licences = await _db.Licences.AsNoTracking().ToListAsync(ct);
        var status = LicenceStatus.Compute(licences, DateTime.UtcNow);
        return Ok(new { licence = new { state = status.State, daysLeft = status.DaysLeft, expiresAt = status.ExpiresAt } });
    }

    /// <summary>Minutes without activity before the automatic logout (0: never).</summary>
    [HttpGet("session")]
    [Authorize]
    public async Task<IActionResult> GetSession(CancellationToken ct)
    {
        var saved = await _db.OverviewSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == IdleKey, ct);
        return Ok(new { idleMinutes = saved == null ? DefaultIdleMinutes : (int)Math.Round(saved.Value) });
    }

    public sealed class SessionRequest
    {
        public int IdleMinutes { get; set; }
    }

    [HttpPut("session")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SetSession([FromBody] SessionRequest request, CancellationToken ct)
    {
        if (request.IdleMinutes != 0 && (request.IdleMinutes < 5 || request.IdleMinutes > 480))
            return BadRequest(new { message = "Le délai doit être de 5 à 480 minutes (0 pour désactiver)." });

        var row = await _db.OverviewSettings.FirstOrDefaultAsync(s => s.Key == IdleKey, ct);
        if (row == null)
            _db.OverviewSettings.Add(new OverviewSetting { Key = IdleKey, Value = request.IdleMinutes, UpdatedBy = CurrentUserId() });
        else
        {
            row.Value = request.IdleMinutes;
            row.UpdatedAt = DateTime.UtcNow;
            row.UpdatedBy = CurrentUserId();
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new { idleMinutes = request.IdleMinutes });
    }

    /// <summary>The licences with the number of users they allow and the number in use.</summary>
    [HttpGet("licences")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetLicences(CancellationToken ct)
    {
        var licences = await _db.Licences.AsNoTracking().Include(l => l.Site).Where(l => !l.IsArchived).OrderBy(l => l.ExpiresAt).ToListAsync(ct);
        var used = await _db.UserProfiles.AsNoTracking().CountAsync(p => p.Status != "archived", ct);
        var status = LicenceStatus.Compute(licences, DateTime.UtcNow);
        return Ok(new
        {
            status = new { state = status.State, daysLeft = status.DaysLeft, expiresAt = status.ExpiresAt },
            usersUsed = used,
            usersMax = LicenceStatus.MaxUsers(licences),
            items = licences.Select(l => new { l.Id, l.Key, l.IsGlobal, l.MaxUsers, l.ExpiresAt, l.SiteId, siteName = l.Site != null ? l.Site.Name : null }),
        });
    }

    public sealed class LicenceRequest
    {
        public string Key { get; set; } = string.Empty;
        public bool IsGlobal { get; set; }
        public int MaxUsers { get; set; }
        public DateTime ExpiresAt { get; set; }
        public Guid? SiteId { get; set; }
    }

    private IActionResult? Invalid(LicenceRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Key)) return BadRequest(new { message = "La clé de licence est obligatoire." });
        if (r.MaxUsers < 1) return BadRequest(new { message = "Le nombre d'utilisateurs doit être d'au moins 1." });
        if (!r.IsGlobal && r.SiteId == null) return BadRequest(new { message = "Une licence par site doit indiquer son site." });
        return null;
    }

    [HttpPost("licences")]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> CreateLicence([FromBody] LicenceRequest request, CancellationToken ct)
    {
        if (Invalid(request) is { } bad) return bad;
        var licence = new Licence
        {
            Key = request.Key.Trim(),
            IsGlobal = request.IsGlobal,
            MaxUsers = request.MaxUsers,
            ExpiresAt = DateTime.SpecifyKind(request.ExpiresAt, DateTimeKind.Utc),
            SiteId = request.IsGlobal ? null : request.SiteId,
            CreatedBy = CurrentUserId(),
        };
        _db.Licences.Add(licence);
        await _db.SaveChangesAsync(ct);
        return Ok(new { licence.Id });
    }

    [HttpPut("licences/{id:guid}")]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> UpdateLicence(Guid id, [FromBody] LicenceRequest request, CancellationToken ct)
    {
        if (Invalid(request) is { } bad) return bad;
        var licence = await _db.Licences.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (licence == null) return NotFound();
        licence.Key = request.Key.Trim();
        licence.IsGlobal = request.IsGlobal;
        licence.MaxUsers = request.MaxUsers;
        licence.ExpiresAt = DateTime.SpecifyKind(request.ExpiresAt, DateTimeKind.Utc);
        licence.SiteId = request.IsGlobal ? null : request.SiteId;
        licence.UpdatedAt = DateTime.UtcNow;
        licence.UpdatedBy = CurrentUserId();
        await _db.SaveChangesAsync(ct);
        return Ok(new { licence.Id });
    }

    /// <summary>Nothing is deleted: an old licence is archived.</summary>
    [HttpDelete("licences/{id:guid}")]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> ArchiveLicence(Guid id, CancellationToken ct)
    {
        var licence = await _db.Licences.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (licence == null) return NotFound();
        licence.IsArchived = true;
        licence.ArchivedAt = DateTime.UtcNow;
        licence.ArchivedBy = CurrentUserId();
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
