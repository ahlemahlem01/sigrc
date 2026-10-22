using System.Security.Claims;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>Reports that generate themselves every week or month. Archived, never deleted.</summary>
[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/report-schedules")]
public class ReportSchedulesController : ControllerBase
{
    private readonly ActionPlanDbContext _db;

    public ReportSchedulesController(ActionPlanDbContext db) => _db = db;

    private static readonly string[] Kinds = ["claims", "capa-actions"];

    public sealed record ScheduleRequest(string Kind, string Title, string Frequency, int DayOfWeek, int DayOfMonth, int Hour, int PeriodDays, string CriteriaJson, string? OrganizationIds);

    private string CurrentUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "system";

    private static object Dto(ReportSchedule s) => new
    {
        s.Id, s.Kind, s.Title, s.Frequency, s.DayOfWeek, s.DayOfMonth, s.Hour, s.PeriodDays, s.IsActive,
        s.NextRunAt, s.LastRunAt, s.LastReportId, s.LastError, s.CreatedByName, s.CreatedAt,
        OrganizationCount = string.IsNullOrWhiteSpace(s.OrganizationIds) ? 0 : s.OrganizationIds.Split(',', StringSplitOptions.RemoveEmptyEntries).Length,
    };

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? kind, CancellationToken ct)
    {
        var query = _db.ReportSchedules.AsNoTracking().Where(s => !s.IsArchived);
        if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(s => s.Kind == kind);
        var rows = await query.OrderBy(s => s.NextRunAt).ToListAsync(ct);
        return Ok(rows.Select(Dto));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ScheduleRequest request, CancellationToken ct)
    {
        if (!Kinds.Contains(request.Kind)) return BadRequest(new { error = "Type de rapport inconnu." });
        var title = (request.Title ?? string.Empty).Trim();
        if (title.Length == 0) return BadRequest(new { error = "Donnez un titre à la programmation." });
        if (request.Frequency is not ("weekly" or "monthly")) return BadRequest(new { error = "Fréquence inconnue." });
        if (request.Hour is < 0 or > 23) return BadRequest(new { error = "Heure invalide." });
        if (request.PeriodDays is < 1 or > 3660) return BadRequest(new { error = "Période invalide." });
        if ((request.CriteriaJson?.Length ?? 0) > 20_000) return BadRequest(new { error = "Critères trop volumineux." });

        var userId = CurrentUserId();
        var name = await _db.UserProfiles.AsNoTracking().Where(p => p.UserId == userId).Select(p => p.Name).FirstOrDefaultAsync(ct)
            ?? User.FindFirstValue(ClaimTypes.Email) ?? userId;
        var schedule = new ReportSchedule
        {
            Kind = request.Kind, OrganizationIds = string.IsNullOrWhiteSpace(request.OrganizationIds) ? null : request.OrganizationIds.Trim(), Title = title.Length > 200 ? title[..200] : title, Frequency = request.Frequency,
            DayOfWeek = Math.Clamp(request.DayOfWeek, 0, 6), DayOfMonth = Math.Clamp(request.DayOfMonth, 1, 28), Hour = request.Hour,
            PeriodDays = request.PeriodDays, CriteriaJson = request.CriteriaJson ?? "{}", CreatedBy = userId, CreatedByName = name,
        };
        schedule.NextRunAt = ReportScheduling.NextRun(schedule, DateTime.UtcNow);
        _db.ReportSchedules.Add(schedule);
        await _db.SaveChangesAsync(ct);
        return Ok(Dto(schedule));
    }

    /// <summary>Pauses or resumes a schedule.</summary>
    [HttpPost("{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, [FromQuery] bool value, CancellationToken ct)
    {
        var s = await _db.ReportSchedules.FirstOrDefaultAsync(x => x.Id == id && !x.IsArchived, ct);
        if (s == null) return NotFound();
        s.IsActive = value;
        if (value) s.NextRunAt = ReportScheduling.NextRun(s, DateTime.UtcNow);
        await _db.SaveChangesAsync(ct);
        return Ok(Dto(s));
    }

    /// <summary>Generates the report now, without moving the regular schedule.</summary>
    [HttpPost("{id:guid}/run")]
    public async Task<IActionResult> RunNow(Guid id, CancellationToken ct)
    {
        var s = await _db.ReportSchedules.FirstOrDefaultAsync(x => x.Id == id && !x.IsArchived, ct);
        if (s == null) return NotFound();
        var next = s.NextRunAt;
        var report = await ReportScheduleHostedService.RunAsync(_db, s, ct);
        s.NextRunAt = next;
        await _db.SaveChangesAsync(ct);
        return report == null ? StatusCode(500, new { error = s.LastError ?? "Échec de la génération." }) : Ok(new { reportId = report.Id });
    }

    [HttpPost("{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        var s = await _db.ReportSchedules.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s == null) return NotFound();
        if (!s.IsArchived)
        {
            s.IsArchived = true;
            s.IsActive = false;
            s.ArchivedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
        return Ok();
    }
}
