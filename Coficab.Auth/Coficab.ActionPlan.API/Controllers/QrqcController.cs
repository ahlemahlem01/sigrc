using System.Text;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The QRQC board of the workshop: the problems that are open, by production line, with the time they have been open and the
/// level that has to deal with them. An administrator sees every problem; a hierarchical manager (a user other profiles name as their manager)
/// sees the problems assigned to the people he manages, read-only. It only reads the claims, their analyses and their action plans: nothing is stored twice.
/// </summary>
[ApiController]
[Authorize]
[Route("api/qrqc")]
public class QrqcController : ControllerBase
{
    private static readonly string[] ClosedOrDraft = { "CLOTUREE", "CLOSED", "VALIDATED", "ARCHIVED", "DRAFT" };
    private static readonly string[] Closed = { "CLOTUREE", "CLOSED", "VALIDATED", "ARCHIVED" };
    private const string NoLine = "—";

    private readonly ActionPlanDbContext _db;

    public QrqcController(ActionPlanDbContext db) => _db = db;

    private sealed record Row(Claim Claim, bool HasRootCause, string? RootCause, bool HasCorrective, string? CorrectiveTitles);

    private string CurrentUserId() => User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value ?? string.Empty;

    private bool IsAdmin() => User.IsInRole("admin") || User.IsInRole("superadmin");

    /// <summary>For a manager: the people he manages and himself. Null for an administrator (no restriction).</summary>
    private List<string>? _restrictTo;

    /// <summary>Sets the restriction of the request; false when the caller is neither an administrator nor a manager.</summary>
    private async Task<bool> PrepareAccessAsync(CancellationToken ct)
    {
        if (IsAdmin()) { _restrictTo = null; return true; }
        var me = CurrentUserId();
        if (me.Length == 0) return false;
        var reports = await _db.UserProfiles.AsNoTracking().Where(p => p.ManagerId == me).Select(p => p.UserId).ToListAsync(ct);
        if (reports.Count == 0) return false;
        reports.Add(me);
        _restrictTo = reports;
        return true;
    }

    /// <summary>Who can open the board and with which scope: tells the front end whether to show the entry.</summary>
    [HttpGet("access")]
    public async Task<IActionResult> Access(CancellationToken ct)
    {
        var admin = IsAdmin();
        var me = CurrentUserId();
        var reports = admin || me.Length == 0 ? 0 : await _db.UserProfiles.AsNoTracking().CountAsync(p => p.ManagerId == me, ct);
        return Ok(new { isAdmin = admin, isManager = reports > 0, reports, canOpen = admin || reports > 0 });
    }

    private IQueryable<Claim> Scope(string? scope)
    {
        var query = _db.Claims.AsNoTracking().Where(c => !c.IsArchived);
        if (_restrictTo is { } ids) query = query.Where(c => c.AssignedToId != null && ids.Contains(c.AssignedToId));
        return string.Equals(scope, "all", StringComparison.OrdinalIgnoreCase) ? query : query.Where(c => c.IsInternal);
    }

    /// <summary>Delays of the escalation: the defaults, or the ones the administrator set (OverviewSettings qrqc.level2/3.minutes).</summary>
    private async Task<int[]> EscalationMinutesAsync(CancellationToken ct)
    {
        var keys = new[] { "qrqc.level2.minutes", "qrqc.level3.minutes" };
        var settings = await _db.OverviewSettings.AsNoTracking().Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        return keys.Select((k, i) => settings.TryGetValue(k, out var v) && v > 0 ? (int)Math.Round(v) : QrqcEscalation.DefaultMinutes[i]).ToArray();
    }

    private async Task<List<Row>> LoadAsync(IQueryable<Claim> claims, CancellationToken ct)
    {
        var list = await claims.ToListAsync(ct);
        var ids = list.Select(c => c.Id).ToList();

        var rootCauses = await _db.FiveWhyAnalyses.AsNoTracking()
            .Where(a => ids.Contains(a.ClaimId) && !a.IsArchived)
            .Select(a => new { a.ClaimId, a.RootCause, a.RootCauseOccurrence }).ToListAsync(ct);
        var rootByClaim = rootCauses
            .GroupBy(a => a.ClaimId)
            .ToDictionary(g => g.Key, g => g.Select(a => !string.IsNullOrWhiteSpace(a.RootCause) ? a.RootCause : a.RootCauseOccurrence).FirstOrDefault(t => !string.IsNullOrWhiteSpace(t)));

        var corrective = await _db.ActionPlans.AsNoTracking()
            .Where(p => p.ClaimId != null && ids.Contains(p.ClaimId.Value) && p.Type == ActionPlanType.PAC)
            .Select(p => new { ClaimId = p.ClaimId!.Value, p.Id }).ToListAsync(ct);
        var planIds = corrective.Select(p => p.Id).ToList();
        var actions = await _db.PlanActions.AsNoTracking().Where(a => planIds.Contains(a.ActionPlanId)).Select(a => new { a.ActionPlanId, a.Title }).ToListAsync(ct);
        var titlesByClaim = corrective.GroupBy(p => p.ClaimId).ToDictionary(
            g => g.Key,
            g => string.Join(" | ", actions.Where(a => g.Any(p => p.Id == a.ActionPlanId)).Select(a => a.Title).Take(3)));

        return list.Select(c =>
        {
            rootByClaim.TryGetValue(c.Id, out var root);
            titlesByClaim.TryGetValue(c.Id, out var titles);
            return new Row(c, !string.IsNullOrWhiteSpace(root), root, !string.IsNullOrWhiteSpace(titles), titles);
        }).ToList();
    }

    /// <summary>scope = internal (default: the problems of the workshop) or all (the customer claims too).</summary>
    [HttpGet("board")]
    public async Task<IActionResult> Board([FromQuery] string? scope, CancellationToken ct)
    {
        if (!await PrepareAccessAsync(ct)) return Forbid();
        var now = DateTime.UtcNow;
        var minutes = await EscalationMinutesAsync(ct);

        var open = await LoadAsync(Scope(scope).Where(c => !ClosedOrDraft.Contains(c.StatusCode.ToUpper())), ct);

        // level 2 is the hierarchical manager of the person in charge, when he is known (otherwise the administrator)
        var assignedIds = open.Select(r => r.Claim.AssignedToId ?? string.Empty).Where(i => i.Length > 0).Distinct().ToList();
        var managers = await _db.UserProfiles.AsNoTracking().Where(p => assignedIds.Contains(p.UserId)).Select(p => new { p.UserId, p.ManagerName }).ToListAsync(ct);
        var managerOf = managers.Where(m => !string.IsNullOrWhiteSpace(m.ManagerName)).ToDictionary(m => m.UserId, m => m.ManagerName!);
        var problems = open.Select(r =>
        {
            var c = r.Claim;
            var minutesOpen = Math.Max(0, (now - c.DetectionDate).TotalMinutes);
            return new
            {
                claimId = c.Id,
                reference = c.Reference,
                title = c.Title,
                defectType = c.DefectType,
                severity = c.Severity,
                line = string.IsNullOrWhiteSpace(c.ProductionLine) ? NoLine : c.ProductionLine!.Trim(),
                lotNumber = c.LotNumber,
                assignedToName = c.AssignedToName,
                managerName = c.AssignedToId != null && managerOf.TryGetValue(c.AssignedToId, out var mn) ? mn : null,
                statusCode = c.StatusCode,
                isInternal = c.IsInternal,
                detectedAt = c.DetectionDate,
                minutesOpen = (int)minutesOpen,
                level = QrqcEscalation.Level(minutesOpen, c.Severity, minutes),
                hasPhoto = !string.IsNullOrEmpty(c.AttachmentName),
                hasLot = !string.IsNullOrWhiteSpace(c.LotNumber),
                hasRootCause = r.HasRootCause,
                hasCorrective = r.HasCorrective,
            };
        }).OrderByDescending(p => p.level).ThenByDescending(p => p.minutesOpen).ToList();

        // the lines of the administrator's list, then the ones that appear only on a problem
        var known = await _db.ReferenceItems.AsNoTracking()
            .Where(r => r.ListKey == ReferenceListKeys.ProductionLine && r.IsActive && r.MergedInto == null)
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Value).Select(r => r.Value).ToListAsync(ct);
        var lineNames = known.Concat(problems.Select(p => p.line)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var lines = lineNames.Select(name =>
        {
            var mine = problems.Where(p => string.Equals(p.line, name, StringComparison.OrdinalIgnoreCase)).ToList();
            return new { line = name, state = QrqcEscalation.LineState(mine.Select(p => p.level)), open = mine.Count, escalated = mine.Count(p => p.level >= 3) };
        }).ToList();

        // closure rate over the last 30 days, on the same scope
        var since = now.AddDays(-30);
        var recent = await Scope(scope).Where(c => c.DetectionDate >= since && c.StatusCode.ToUpper() != "DRAFT").Select(c => c.StatusCode).ToListAsync(ct);
        var closed30 = recent.Count(s => Closed.Contains(s.ToUpperInvariant()));

        return Ok(new
        {
            generatedAt = now,
            scope = string.Equals(scope, "all", StringComparison.OrdinalIgnoreCase) ? "all" : "internal",
            escalationMinutes = minutes,
            kpis = new
            {
                open = problems.Count,
                escalated = problems.Count(p => p.level >= 3),
                newToday = problems.Count(p => p.detectedAt.Date == now.Date),
                closureRate30d = recent.Count == 0 ? (int?)null : (int)Math.Round(100.0 * closed30 / recent.Count),
            },
            lines,
            problems,
        });
    }

    /// <summary>The problems as SAP QM quality notifications (semicolon CSV, technical field names) for an upload by the quality team.</summary>
    [HttpGet("export")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Export([FromQuery] string? scope, [FromQuery] bool includeClosed = false, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var minutes = await EscalationMinutesAsync(ct);
        var query = Scope(scope).Where(c => c.StatusCode.ToUpper() != "DRAFT");
        if (!includeClosed) query = query.Where(c => !Closed.Contains(c.StatusCode.ToUpper()));

        var rows = (await LoadAsync(query.OrderByDescending(c => c.DetectionDate).Take(5000), ct)).Select(r =>
        {
            var c = r.Claim;
            var minutesOpen = Math.Max(0, (now - c.DetectionDate).TotalMinutes);
            return (IReadOnlyList<string?>)new[]
            {
                QrqcSapExport.NotificationType(c.IsInternal),
                c.Reference ?? c.Id.ToString()[..8],
                c.Title,
                QrqcSapExport.Date(c.DetectionDate),
                string.IsNullOrWhiteSpace(c.ProductionLine) ? null : c.ProductionLine,
                c.LotNumber,
                QrqcSapExport.Priority(c.Severity),
                c.DefectType,
                r.RootCause,
                r.CorrectiveTitles,
                QrqcSapExport.Status(c.StatusCode),
                c.StatusCode,
                QrqcEscalation.Level(minutesOpen, c.Severity, minutes).ToString(),
                ((int)minutesOpen).ToString(),
            };
        });

        var bytes = new UTF8Encoding(true).GetPreamble().Concat(Encoding.UTF8.GetBytes(QrqcSapExport.Csv(rows))).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"qrqc-sap-qm-{now:yyyyMMdd-HHmm}.csv");
    }
}
