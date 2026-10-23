using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/alerts")]
[Authorize]
public class AlertsController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    private readonly IAlertAnalysisService _alertAnalysis;
    private readonly IAlertHistoryService _history;

    public AlertsController(
        IApplicationDbContext db,
        IAlertAnalysisService alertAnalysis,
        IAlertHistoryService history)
    {
        _db = db;
        _alertAnalysis = alertAnalysis;
        _history = history;
    }

    private string? UserId =>
        User.FindFirst("sub")?.Value
        ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private bool IsAdminOrSuperAdmin =>
        User.IsInRole("admin")
        || User.IsInRole("Admin")
        || User.IsInRole("superadmin")
        || User.IsInRole("SuperAdmin")
        || User.IsInRole("admin_quality")
        || User.IsInRole("Admin_Quality");

    private bool IsQualityAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        return roles.Contains("admin")
            || roles.Contains("superadmin")
            || roles.Contains("admin_quality")
            || IsAdminOrSuperAdmin;
    }

    /// <summary>
    /// Liste des alertes visibles par l'utilisateur :
    /// Admin/SuperAdmin → toutes ; employé → département ou ligne de production.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAlerts(
        [FromQuery] string? status = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId))
            return Unauthorized();

        var query = _db.Alerts.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var s = status.Trim().ToLowerInvariant();
            if (s is "archived" or "resolved")
                query = query.Where(a => a.Status.ToLower() == "archived" || a.Status.ToLower() == "resolved");
            else if (s is "pending_validation" or "pending" or "active")
                query = query.Where(a => a.Status.ToLower() == "pending_validation" || a.Status.ToLower() == "active");
            else
                query = query.Where(a => a.Status.ToLower() == s);
        }

        if (!IsAdminOrSuperAdmin)
        {
            var profile = await _db.UserProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == UserId, cancellationToken);

            if (profile == null)
                return Ok(new { data = Array.Empty<object>() });

            var deptId = profile.DepartmentId;
            var lines = await MyLinesAsync(profile.LigneProduction, cancellationToken);

            query = query.Where(a =>
                (deptId != null && a.DepartmentId == deptId)
                || (a.ProductionLine != null && lines.Contains(a.ProductionLine.ToLower())));
        }

        var alerts = await query
            .OrderByDescending(a => a.DetectedAt)
            .Take(200)
            .Select(a => new
            {
                a.Id,
                a.Type,
                a.DefectType,
                a.ProductionLine,
                a.Description,
                a.ZScore,
                a.CurrentCount,
                a.BaselineMean,
                a.DetectedAt,
                a.Status,
                a.DepartmentId,
                a.AiProblem,
                a.AiProbableCause,
                a.AiConsequences,
                a.AiAnalyzedAt,
                a.ArchiveReason,
                a.ArchivedAt,
                a.ArchivedBy,
            })
            .ToListAsync(cancellationToken);

        return Ok(new { data = alerts });
    }

    /// <summary>
    /// Génère (ou régénère) la mini-analyse Gemini pour une alerte.
    /// Destiné au backfill et aux alertes créées avant l'analyse IA.
    /// </summary>
    [HttpPost("{id:guid}/generate-analysis")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public async Task<IActionResult> GenerateAnalysis(
        Guid id,
        [FromQuery] bool force = false,
        CancellationToken cancellationToken = default)
    {
        var exists = await _db.Alerts.AnyAsync(a => a.Id == id, cancellationToken);
        if (!exists)
            return NotFound();

        try
        {
            await _alertAnalysis.GenerateAndPersistAsync(id, force, cancellationToken);
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { message = ex.Message });
        }

        var alert = await _db.Alerts.AsNoTracking().FirstAsync(a => a.Id == id, cancellationToken);
        return Ok(new
        {
            data = new
            {
                alert.Id,
                alert.AiProblem,
                alert.AiProbableCause,
                alert.AiConsequences,
                alert.AiAnalyzedAt,
            }
        });
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> GetHistory(Guid id, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        if (!await CanSeeAlertAsync(id, cancellationToken)) return NotFound();
        var history = await _history.GetHistoryAsync(id, cancellationToken);
        return Ok(new { data = history });
    }

    /// <summary>
    /// Toutes les réclamations du couple défaut/ligne de l'alerte
    /// (même périmètre que le volume CurrentCount), pour les utilisateurs autorisés.
    /// </summary>
    [HttpGet("{id:guid}/claims")]
    public async Task<IActionResult> GetAlertClaims(Guid id, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        if (!await CanSeeAlertAsync(id, cancellationToken)) return NotFound();

        var alert = await _db.Alerts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (alert == null) return NotFound();

        var defect = (alert.DefectType ?? string.Empty).Trim();
        var line = (alert.ProductionLine ?? string.Empty).Trim();
        var lineIsUnknown = string.IsNullOrEmpty(line)
            || string.Equals(line, "UNKNOWN", StringComparison.OrdinalIgnoreCase);

        // Projection sans AttachmentData (évite des payloads énormes / erreurs de sérialisation).
        var rows = await _db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id,
                c.Title,
                c.ClientId,
                c.DefectType,
                c.Severity,
                c.LotNumber,
                c.SerialNumber,
                c.Description,
                c.StatusCode,
                c.AssignedToId,
                c.AssignedToName,
                c.AssignedAt,
                c.Deadline,
                c.CompletedAt,
                c.IsOnTime,
                c.EstimatedDaysP50,
                c.EstimatedDaysP80,
                c.EstimateMethod,
                c.EstimateSampleSize,
                c.EstimatedAt,
                c.DetectionDate,
                c.CreatedById,
                c.AttachmentName,
                c.AttachmentContentType,
                c.UpdatedAt,
                c.UpdatedById,
                c.IsArchived,
                c.CreatedAt,
                c.CreatedBy,
                c.ProductionLine,
                c.Shift,
                c.AnalysisNotes,
            })
            .Take(2000)
            .ToListAsync(cancellationToken);

        var claims = rows
            .Where(c => string.Equals((c.DefectType ?? string.Empty).Trim(), defect, StringComparison.OrdinalIgnoreCase))
            .Where(c =>
            {
                var claimLine = (c.ProductionLine ?? string.Empty).Trim();
                if (lineIsUnknown)
                {
                    return string.IsNullOrEmpty(claimLine)
                        || string.Equals(claimLine, "UNKNOWN", StringComparison.OrdinalIgnoreCase);
                }
                return string.Equals(claimLine, line, StringComparison.OrdinalIgnoreCase);
            })
            .Where(c =>
            {
                // Employé : uniquement créées par lui ou assignées à lui.
                if (IsQualityAdmin()) return true;
                var uid = (UserId ?? string.Empty).Trim();
                if (uid.Length == 0) return false;
                return string.Equals(c.CreatedById, uid, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(c.AssignedToId, uid, StringComparison.OrdinalIgnoreCase);
            })
            .Take(200)
            .ToList();

        return Ok(claims);
    }

    [HttpPost("{id:guid}/archive")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public async Task<IActionResult> Archive(Guid id, [FromQuery] string reason = "manual", CancellationToken cancellationToken = default)
    {
        try
        {
            await _history.ArchiveAsync(id, reason, UserId ?? "system", ActorName, cancellationToken);
            return Ok(new { data = new { id, status = "archived" } });
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }

    [HttpPost("{id:guid}/unarchive")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public async Task<IActionResult> Unarchive(Guid id, CancellationToken cancellationToken = default)
    {
        try
        {
            await _history.UnarchiveAsync(id, UserId ?? "system", ActorName, cancellationToken);
            return Ok(new { data = new { id, status = "restored" } });
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Alias de clôture : archive, ne supprime pas.</summary>
    [HttpPost("{id:guid}/resolve")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public Task<IActionResult> Resolve(Guid id, CancellationToken cancellationToken = default)
        => Archive(id, "manual", cancellationToken);

    [HttpPost("{id:guid}/reports")]
    public async Task<IActionResult> SubmitReport(Guid id, [FromBody] AlertTextRequest body, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        try
        {
            var report = await _history.SubmitReportAsync(id, body.Text, UserId, ActorName, cancellationToken);
            return Ok(new { data = new { report.Id, report.Status } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:guid}/decide")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public async Task<IActionResult> Decide(Guid id, [FromQuery] bool accept, [FromBody] AlertTextRequest? body, CancellationToken cancellationToken = default)
    {
        try
        {
            await _history.DecideAsync(id, accept, body?.Text, UserId ?? "system", ActorName, cancellationToken);
            return Ok(new { data = new { id, status = accept ? "validated" : "rejected" } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:guid}/reports/{reportId:guid}/reject")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public Task<IActionResult> RejectReport(Guid id, Guid reportId, [FromBody] AlertTextRequest? body, CancellationToken cancellationToken = default)
        => ReviewReport(id, reportId, accept: false, body?.Text, cancellationToken);

    [HttpPost("{id:guid}/reports/{reportId:guid}/validate")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public Task<IActionResult> ValidateReport(Guid id, Guid reportId, [FromBody] AlertTextRequest? body, CancellationToken cancellationToken = default)
        => ReviewReport(id, reportId, accept: true, body?.Text, cancellationToken);

    [HttpPut("{id:guid}/reports/{reportId:guid}")]
    public async Task<IActionResult> UpdateReport(Guid id, Guid reportId, [FromBody] AlertTextRequest body, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        if (!await CanSeeAlertAsync(id, cancellationToken)) return NotFound();
        try
        {
            await _history.UpdateReportAsync(id, reportId, body.Text, UserId, cancellationToken);
            return Ok(new { data = new { id = reportId } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("{id:guid}/analysis")]
    public async Task<IActionResult> UpdateAnalysis(Guid id, [FromBody] AlertAnalysisRequest body, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        if (!await CanSeeAlertAsync(id, cancellationToken)) return NotFound();
        try
        {
            await _history.UpdateAnalysisAsync(id, body.Problem, body.ProbableCause, body.Consequences, UserId, ActorName, cancellationToken);
            return Ok();
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:guid}/comments")]
    public async Task<IActionResult> AddComment(Guid id, [FromBody] AlertTextRequest body, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        try
        {
            var comment = await _history.AddCommentAsync(id, body.Text, UserId, ActorName, cancellationToken);
            return Ok(new { data = new { comment.Id } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:guid}/comments/{commentId:guid}/archive")]
    public async Task<IActionResult> ArchiveComment(Guid id, Guid commentId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        try
        {
            await _history.ArchiveCommentAsync(id, commentId, UserId, ActorName, cancellationToken);
            return Ok(new { data = new { id = commentId, archived = true } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }

    [HttpPost("{id:guid}/attachments")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> AddAttachment(Guid id, IFormFile file, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        if (!await CanSeeAlertAsync(id, cancellationToken)) return NotFound();
        var alert = await _db.Alerts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
        var status = alert?.Status?.Trim().ToLowerInvariant();
        if (status is not ("pending_validation" or "active"))
            return BadRequest(new { message = "Pièce jointe possible uniquement tant que l’alerte est en attente de validation." });
        if (file == null || file.Length == 0) return BadRequest(new { message = "Fichier manquant." });
        await using var ms = new MemoryStream();
        await file.CopyToAsync(ms, cancellationToken);
        try
        {
            var saved = await _history.AddAttachmentAsync(id, file.FileName, file.ContentType, ms.ToArray(), UserId, ActorName, cancellationToken);
            return Ok(new { data = new { saved.Id, saved.FileName } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:guid}/attachments/{attachmentId:guid}/archive")]
    public async Task<IActionResult> ArchiveAttachment(Guid id, Guid attachmentId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        try
        {
            await _history.ArchiveAttachmentAsync(id, attachmentId, UserId, ActorName, cancellationToken);
            return Ok(new { data = new { id = attachmentId, archived = true } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }

    [HttpGet("{id:guid}/attachments/{attachmentId:guid}")]
    public async Task<IActionResult> DownloadAttachment(Guid id, Guid attachmentId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        if (!await CanSeeAlertAsync(id, cancellationToken)) return NotFound();
        var file = await _db.AlertAttachments.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.AlertId == id, cancellationToken);
        if (file == null) return NotFound();
        return File(file.Data, file.ContentType ?? "application/octet-stream", file.FileName);
    }

    [HttpPost("{id:guid}/capas")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public async Task<IActionResult> LinkCapa(Guid id, [FromBody] AlertLinkCapaRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            await _history.LinkCapaAsync(id, body.ActionPlanId, UserId ?? "system", ActorName, cancellationToken);
            return Ok(new { data = new { actionPlanId = body.ActionPlanId } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }

    [HttpPost("{id:guid}/monitoring")]
    [Authorize(Roles = "admin,superadmin,Admin,SuperAdmin")]
    public async Task<IActionResult> Monitoring(Guid id, [FromBody] AlertTextRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            await _history.RecordMonitoringAsync(id, body.Text, UserId ?? "system", ActorName, cancellationToken);
            return Ok();
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    private async Task<IActionResult> ReviewReport(Guid id, Guid reportId, bool accept, string? note, CancellationToken cancellationToken)
    {
        try
        {
            await _history.ReviewReportAsync(id, reportId, accept, note, UserId ?? "system", ActorName, cancellationToken);
            return Ok(new { data = new { id = reportId, status = accept ? "Validated" : "Rejected" } });
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }

    private string? ActorName =>
        User.FindFirst("name")?.Value
        ?? User.FindFirst(ClaimTypes.Name)?.Value
        ?? User.FindFirst(ClaimTypes.Email)?.Value;

    private async Task<bool> CanSeeAlertAsync(Guid id, CancellationToken cancellationToken)
    {
        var alert = await _db.Alerts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (alert == null) return false;
        if (IsAdminOrSuperAdmin) return true;

        var profile = await _db.UserProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == UserId, cancellationToken);
        if (profile == null) return false;

        var lines = await MyLinesAsync(profile.LigneProduction, cancellationToken);
        return (profile.DepartmentId != null && alert.DepartmentId == profile.DepartmentId)
            || (!string.IsNullOrEmpty(alert.ProductionLine) && lines.Contains(alert.ProductionLine.ToLowerInvariant()));
    }

    /// <summary>
    /// The production lines an employee follows: the one on the profile plus those of the files they handle
    /// (assigned to them or created by them, still open).
    /// </summary>
    private async Task<List<string>> MyLinesAsync(string? profileLine, CancellationToken cancellationToken)
    {
        var lines = await _db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.ProductionLine != null
                && (c.AssignedToId == UserId || c.CreatedById == UserId)
                && c.StatusCode != "CLOTUREE" && c.StatusCode != "CLOSED" && c.StatusCode != "VALIDATED" && c.StatusCode != "ARCHIVED")
            .Select(c => c.ProductionLine!.ToLower())
            .Distinct()
            .ToListAsync(cancellationToken);
        var own = profileLine?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(own) && !lines.Contains(own)) lines.Add(own);
        return lines;
    }

    public class AlertTextRequest
    {
        public string Text { get; set; } = string.Empty;
    }

    public class AlertAnalysisRequest
    {
        public string? Problem { get; set; }
        public string? ProbableCause { get; set; }
        public string? Consequences { get; set; }
    }

    public class AlertLinkCapaRequest
    {
        public Guid ActionPlanId { get; set; }
    }
}
