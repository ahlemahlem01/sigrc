using System.Security.Claims;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>Reports kept by administrators: saved with their criteria and figures, reopened later, archived (never deleted).</summary>
[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/saved-reports")]
public class SavedReportsController : ControllerBase
{
    private static readonly string[] Kinds = ["claims", "capa-actions", "team"];
    private const int MaxJsonChars = 8_000_000;
    private readonly ActionPlanDbContext _db;

    public SavedReportsController(ActionPlanDbContext db) => _db = db;

    public sealed record SaveReportRequest(string Kind, string Title, string CriteriaJson, string ResultJson, int ItemCount);

    /// <summary>The edited content of a report: its title, its figures (the result) and, optionally, the criteria, with a note saying why.</summary>
    public sealed record EditReportRequest(string? Title, string? ResultJson, string? CriteriaJson, int? ItemCount, string? Note);

    private string CurrentUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "system";

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? kind, CancellationToken ct)
    {
        var query = _db.SavedReports.AsNoTracking().Where(r => !r.IsArchived);
        if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(r => r.Kind == kind);
        var rows = await query.OrderByDescending(r => r.CreatedAt).Take(200)
            .Select(r => new { r.Id, r.Kind, r.Title, r.ItemCount, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.Version, r.UpdatedAt, r.UpdatedByName })
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// <summary>
    /// The history of the reports, paged and filterable: by type, words of the title, author, period, edited or not, and by state
    /// (active by default, archived, or all). Nothing is ever deleted: archived reports are listed here and can be restored.
    /// </summary>
    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string? kind, [FromQuery] string? q, [FromQuery] string? author,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] string? state, [FromQuery] bool? edited,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default)
    {
        pageSize = Math.Clamp(pageSize, 1, 50);
        page = Math.Max(1, page);

        var query = _db.SavedReports.AsNoTracking().AsQueryable();
        query = (state ?? "active").ToLowerInvariant() switch
        {
            "archived" => query.Where(r => r.IsArchived),
            "all" => query,
            _ => query.Where(r => !r.IsArchived),
        };
        if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(r => r.Kind == kind);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(r => r.Title.Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(author))
        {
            var who = author.Trim();
            query = query.Where(r => (r.CreatedByName ?? "").Contains(who) || (r.UpdatedByName ?? "").Contains(who));
        }
        if (from is { } f) query = query.Where(r => r.CreatedAt >= f);
        if (to is { } t) query = query.Where(r => r.CreatedAt < t.Date.AddDays(1));
        if (edited is { } e) query = e ? query.Where(r => r.Version > 1) : query.Where(r => r.Version <= 1);

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(r => r.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(r => new
            {
                r.Id, r.Kind, r.Title, r.ItemCount, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.Version, r.UpdatedAt, r.UpdatedByName,
                r.IsArchived, r.ArchivedAt,
            })
            .ToListAsync(ct);
        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await _db.SavedReports.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        return r == null ? NotFound() : Ok(new { r.Id, r.Kind, r.IsArchived, r.Title, r.ItemCount, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.Version, r.UpdatedAt, r.UpdatedByName, r.CriteriaJson, r.ResultJson });
    }

    [HttpPost]
    public async Task<IActionResult> Save([FromBody] SaveReportRequest request, CancellationToken ct)
    {
        if (!Kinds.Contains(request.Kind)) return BadRequest(new { error = "Type de rapport inconnu." });
        var title = (request.Title ?? string.Empty).Trim();
        if (title.Length == 0) return BadRequest(new { error = "Donnez un titre au rapport." });
        if (title.Length > 200) title = title[..200];
        if ((request.CriteriaJson?.Length ?? 0) > 20_000 || (request.ResultJson?.Length ?? 0) > MaxJsonChars)
            return BadRequest(new { error = "Le rapport est trop volumineux pour être enregistré : réduisez la période ou ajoutez des filtres." });

        var userId = CurrentUserId();
        var name = await _db.UserProfiles.AsNoTracking().Where(p => p.UserId == userId).Select(p => p.Name).FirstOrDefaultAsync(ct)
            ?? User.FindFirstValue(ClaimTypes.Email) ?? userId;
        var report = new SavedReport
        {
            Kind = request.Kind, Title = title, CriteriaJson = request.CriteriaJson ?? "{}", ResultJson = request.ResultJson ?? "{}",
            ItemCount = Math.Max(0, request.ItemCount), CreatedBy = userId, CreatedByName = name,
        };
        _db.SavedReports.Add(report);
        await _db.SaveChangesAsync(ct);
        return Ok(new { report.Id, report.Kind, report.Title, report.ItemCount, report.CreatedBy, report.CreatedByName, report.CreatedAt });
    }

    /// <summary>
    /// Edits a saved report (its title and any of its figures). The content it had before is kept as a version, so an edit never
    /// erases the past: who changed what, and when, stays readable.
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Edit(Guid id, [FromBody] EditReportRequest request, CancellationToken ct)
    {
        var r = await _db.SavedReports.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r == null) return NotFound();
        if (r.IsArchived) return Conflict(new { error = "Ce rapport est archivé : il n'est plus modifiable." });

        var title = request.Title is null ? r.Title : request.Title.Trim();
        if (title.Length == 0) return BadRequest(new { error = "Donnez un titre au rapport." });
        if (title.Length > 200) title = title[..200];
        if ((request.CriteriaJson?.Length ?? 0) > 20_000 || (request.ResultJson?.Length ?? 0) > MaxJsonChars)
            return BadRequest(new { error = "Le rapport est trop volumineux pour être enregistré." });
        foreach (var json in new[] { request.CriteriaJson, request.ResultJson })
        {
            if (json is null) continue;
            try { System.Text.Json.JsonDocument.Parse(json).Dispose(); }
            catch (System.Text.Json.JsonException) { return BadRequest(new { error = "Le contenu du rapport n'est pas valide." }); }
        }

        var userId = CurrentUserId();
        var name = await _db.UserProfiles.AsNoTracking().Where(p => p.UserId == userId).Select(p => p.Name).FirstOrDefaultAsync(ct)
            ?? User.FindFirstValue(ClaimTypes.Email) ?? userId;

        // the state before the edit goes to the history, once (version 1 is the report as it was first saved)
        _db.SavedReportVersions.Add(new SavedReportVersion
        {
            SavedReportId = r.Id, VersionNumber = r.Version, Title = r.Title, CriteriaJson = r.CriteriaJson, ResultJson = r.ResultJson,
            ItemCount = r.ItemCount, SavedAt = r.UpdatedAt ?? r.CreatedAt, SavedBy = r.UpdatedBy ?? r.CreatedBy, SavedByName = r.UpdatedByName ?? r.CreatedByName, Note = r.UpdateNote,
        });

        r.Title = title;
        if (request.ResultJson is not null) r.ResultJson = request.ResultJson;
        if (request.CriteriaJson is not null) r.CriteriaJson = request.CriteriaJson;
        if (request.ItemCount is { } count) r.ItemCount = Math.Max(0, count);
        r.Version += 1;
        r.UpdatedAt = DateTime.UtcNow;
        r.UpdatedBy = userId;
        r.UpdatedByName = name;
        r.UpdateNote = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim()[..Math.Min(request.Note.Trim().Length, 1000)];
        await _db.SaveChangesAsync(ct);
        return Ok(new { r.Id, r.Title, r.ItemCount, r.Version, r.UpdatedAt, r.UpdatedByName });
    }

    /// <summary>The earlier contents of a report (newest first), the current one included as the top entry.</summary>
    [HttpGet("{id:guid}/versions")]
    public async Task<IActionResult> Versions(Guid id, CancellationToken ct)
    {
        var r = await _db.SavedReports.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r == null) return NotFound();
        var past = await _db.SavedReportVersions.AsNoTracking().Where(v => v.SavedReportId == id)
            .OrderByDescending(v => v.VersionNumber)
            .Select(v => new { v.VersionNumber, v.Title, v.ItemCount, v.SavedAt, v.SavedByName, v.Note, Current = false })
            .ToListAsync(ct);
        var current = new { VersionNumber = r.Version, r.Title, r.ItemCount, SavedAt = r.UpdatedAt ?? r.CreatedAt, SavedByName = r.UpdatedByName ?? r.CreatedByName, Note = r.UpdateNote, Current = true };
        return Ok(new[] { current }.Concat(past.Select(p => new { p.VersionNumber, p.Title, p.ItemCount, p.SavedAt, SavedByName = p.SavedByName, Note = p.Note, p.Current })));
    }

    [HttpGet("{id:guid}/versions/{version:int}")]
    public async Task<IActionResult> GetVersion(Guid id, int version, CancellationToken ct)
    {
        var v = await _db.SavedReportVersions.AsNoTracking().FirstOrDefaultAsync(x => x.SavedReportId == id && x.VersionNumber == version, ct);
        return v == null ? NotFound() : Ok(new { v.VersionNumber, v.Title, v.ItemCount, v.SavedAt, v.SavedByName, v.CriteriaJson, v.ResultJson });
    }

    /// <summary>Takes the report out of the list; it stays in the database.</summary>
    [HttpPost("{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        var r = await _db.SavedReports.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r == null) return NotFound();
        if (!r.IsArchived)
        {
            r.IsArchived = true;
            r.ArchivedAt = DateTime.UtcNow;
            r.ArchivedBy = CurrentUserId();
            await _db.SaveChangesAsync(ct);
        }
        return Ok();
    }

    /// <summary>Puts an archived report back in the list (reports are archived, never deleted, and can come back).</summary>
    [HttpPost("{id:guid}/unarchive")]
    public async Task<IActionResult> Unarchive(Guid id, CancellationToken ct)
    {
        var r = await _db.SavedReports.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r == null) return NotFound();
        if (r.IsArchived)
        {
            r.IsArchived = false;
            r.ArchivedAt = null;
            r.ArchivedBy = null;
            await _db.SaveChangesAsync(ct);
        }
        return Ok();
    }
}
