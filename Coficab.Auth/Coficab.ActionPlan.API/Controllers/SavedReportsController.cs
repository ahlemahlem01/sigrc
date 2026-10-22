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
    private static readonly string[] Kinds = ["claims", "capa-actions"];
    private const int MaxJsonChars = 8_000_000;
    private readonly ActionPlanDbContext _db;

    public SavedReportsController(ActionPlanDbContext db) => _db = db;

    public sealed record SaveReportRequest(string Kind, string Title, string CriteriaJson, string ResultJson, int ItemCount);

    private string CurrentUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "system";

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? kind, CancellationToken ct)
    {
        var query = _db.SavedReports.AsNoTracking().Where(r => !r.IsArchived);
        if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(r => r.Kind == kind);
        var rows = await query.OrderByDescending(r => r.CreatedAt).Take(200)
            .Select(r => new { r.Id, r.Kind, r.Title, r.ItemCount, r.CreatedBy, r.CreatedByName, r.CreatedAt })
            .ToListAsync(ct);
        return Ok(rows);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var r = await _db.SavedReports.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && !x.IsArchived, ct);
        return r == null ? NotFound() : Ok(new { r.Id, r.Kind, r.Title, r.ItemCount, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.CriteriaJson, r.ResultJson });
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
}
