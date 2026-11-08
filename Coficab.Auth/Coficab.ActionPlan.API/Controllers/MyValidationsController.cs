using System.Security.Claims;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// What an employee sent and that still waits for an administrator's decision (5 Why, CAPA plans at 100 %, 8D dossiers), with a way to
/// remind the validators when it takes long. A reminder is limited to one a day per item and per person, and is kept in the history.
/// </summary>
[ApiController]
[Route("api/my-validations")]
[Authorize]
public class MyValidationsController : ControllerBase
{
    public const string FiveWhy = "fiveWhy";
    public const string Capa = "capa";
    public const string EightD = "eightD";

    /// <summary>One reminder a day per item.</summary>
    public static readonly TimeSpan Cooldown = TimeSpan.FromHours(24);

    private readonly IApplicationDbContext _db;
    private readonly INotificationService _notifications;

    public MyValidationsController(IApplicationDbContext db, INotificationService notifications)
    {
        _db = db;
        _notifications = notifications;
    }

    private string? UserId => User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private sealed record Pending(string Kind, Guid Id, Guid? ClaimId, string? Reference, string Title, DateTime Since, string LinkPath, Guid? DepartmentId = null, int? Progress = null,
        PlanApprovalStatus Approval = PlanApprovalStatus.Approved, string? ApprovalComment = null)
    {
        /// <summary>Waiting for a decision now: a plan to approve, or an approved plan whose actions are all done.</summary>
        public bool Ready => Kind != Capa || Approval == PlanApprovalStatus.Pending || (Approval == PlanApprovalStatus.Approved && Progress >= 100);
    }

    private async Task<List<Pending>> PendingOfAsync(string me, CancellationToken ct)
    {
        var items = new List<Pending>();

        var fiveWhys = await (from a in _db.FiveWhyAnalyses.AsNoTracking()
                              join c in _db.Claims.AsNoTracking() on a.ClaimId equals c.Id
                              where !a.IsArchived && !c.IsArchived
                                    && (a.StatusCode == "PENDING_VALIDATION" || a.StatusCode == "PENDING")
                                    && (c.AssignedToId == me || c.CreatedById == me || a.CreatedBy == me || a.LastModifiedBy == me)
                              select new { a.Id, ClaimId = c.Id, c.Reference, c.Title, Since = a.LastModifiedAt ?? a.CreatedAt }).ToListAsync(ct);
        items.AddRange(fiveWhys.Select(r => new Pending(FiveWhy, r.Id, r.ClaimId, r.Reference, r.Title, r.Since,
            $"/pages/front/quality-analyses/5why/{r.ClaimId}")));

        var dossiers = await (from d in _db.EightDDossiers.AsNoTracking()
                              join c in _db.Claims.AsNoTracking() on d.ClaimId equals c.Id
                              where !c.IsArchived && d.StatusCode == "PENDING_VALIDATION"
                                    && (c.AssignedToId == me || c.CreatedById == me || d.ChampionId == me || d.UpdatedBy == me)
                              select new { d.Id, ClaimId = c.Id, c.Reference, c.Title, Since = d.SubmittedAt ?? d.UpdatedAt ?? d.CreatedAt }).ToListAsync(ct);
        items.AddRange(dossiers.Select(r => new Pending(EightD, r.Id, r.ClaimId, r.Reference, r.Title, r.Since,
            $"/pages/front/quality-analyses/8d/{r.ClaimId}")));

        var plans = await _db.ActionPlans.AsNoTracking()
            .Where(p => !p.IsArchived && p.ClaimId != null
                        && (p.Status == ActionPlanStatus.Created || p.Status == ActionPlanStatus.Ongoing)
                        // waiting for a decision: to approve, returned, or finished and waiting for the final validation (not the plans being carried out)
                        && (p.ApprovalStatus != PlanApprovalStatus.Approved || p.Progress >= 100)
                        && (p.AssignedToId == me || p.OwnerId == me))
            .Select(p => new { p.Id, p.ClaimId, p.Reference, p.Title, p.DepartmentId, p.Progress, p.ApprovalStatus, p.ApprovalComment, Since = p.UpdatedAt ?? p.CreatedAt })
            .ToListAsync(ct);
        items.AddRange(plans.Select(r => new Pending(Capa, r.Id, r.ClaimId, r.Reference, r.Title, r.Since,
            $"/pages/front/my-action-plans/{r.Id}", r.DepartmentId, r.Progress, r.ApprovalStatus, r.ApprovalComment)));

        return items;
    }

    [HttpGet]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var me = UserId;
        if (string.IsNullOrWhiteSpace(me)) return Unauthorized();
        var items = await PendingOfAsync(me, ct);

        var ids = items.Select(i => i.Id).ToList();
        var reminders = await _db.ValidationReminders.AsNoTracking()
            .Where(r => r.RequestedById == me && ids.Contains(r.TargetId))
            .GroupBy(r => new { r.Kind, r.TargetId })
            .Select(g => new { g.Key.Kind, g.Key.TargetId, Last = g.Max(x => x.CreatedAt), Count = g.Count() })
            .ToListAsync(ct);
        var now = DateTime.UtcNow;

        return Ok(items.OrderBy(i => i.Since).Select(i =>
        {
            var r = reminders.FirstOrDefault(x => x.Kind == i.Kind && x.TargetId == i.Id);
            return new
            {
                kind = i.Kind, id = i.Id, claimId = i.ClaimId, reference = i.Reference, title = i.Title, since = i.Since, linkPath = i.LinkPath,
                lastReminderAt = r?.Last, reminderCount = r?.Count ?? 0,
                progress = i.Progress,
                approval = i.Kind == Capa ? i.Approval.ToString().ToLowerInvariant() : null,
                approvalComment = i.ApprovalComment,
                ready = i.Ready,
                canRemind = i.Ready && (r == null || now - r.Last >= Cooldown),
                nextReminderAt = r != null && now - r.Last < Cooldown ? (DateTime?)(r.Last + Cooldown) : null,
            };
        }));
    }

    public sealed class RemindRequest
    {
        public string Kind { get; set; } = string.Empty;
        public Guid TargetId { get; set; }
    }

    [HttpPost("remind")]
    public async Task<IActionResult> Remind([FromBody] RemindRequest request, CancellationToken ct)
    {
        var me = UserId;
        if (string.IsNullOrWhiteSpace(me)) return Unauthorized();

        var item = (await PendingOfAsync(me, ct)).FirstOrDefault(i => i.Kind == request.Kind && i.Id == request.TargetId);
        if (item == null)
            return NotFound(new { code = "notPending", message = "Cet élément n'est plus en attente de validation." });

        if (!item.Ready)
            return Conflict(new { code = "notReady", message = "Le plan peut être validé quand toutes ses actions sont terminées." });

        var last = await _db.ValidationReminders.AsNoTracking()
            .Where(r => r.RequestedById == me && r.Kind == item.Kind && r.TargetId == item.Id)
            .OrderByDescending(r => r.CreatedAt).Select(r => (DateTime?)r.CreatedAt).FirstOrDefaultAsync(ct);
        var now = DateTime.UtcNow;
        if (last.HasValue && now - last.Value < Cooldown)
            return Conflict(new { code = "tooSoon", message = "Vous avez déjà relancé la validation aujourd'hui.", nextReminderAt = last.Value + Cooldown });

        var who = User.FindFirst("name")?.Value ?? User.FindFirstValue(ClaimTypes.Name) ?? "Un employé";
        var which = string.IsNullOrWhiteSpace(item.Reference) ? $"« {item.Title} »" : $"{item.Reference} « {item.Title} »";
        var days = (int)Math.Floor((now - item.Since).TotalDays);
        var waiting = days >= 1 ? $" (en attente depuis {days} j)" : string.Empty;
        var (what, permission, link, label) = item.Kind switch
        {
            FiveWhy => ("valider l'analyse 5 Why de", PermissionAccess.ValidateFiveWhy, $"/pages/front/validations?tab=fivewhy&claimId={item.ClaimId}", "5 Why"),
            EightD => ("valider le dossier 8D de", PermissionAccess.ValidateEightD, $"/pages/front/validations?tab=dossiers&claimId={item.ClaimId}", "dossier 8D"),
            _ when item.Approval == PlanApprovalStatus.Pending => ("approuver le plan d'actions de", PermissionAccess.ValidateFiveWhy, "/pages/front/validations?tab=approval", "plan d'actions à approuver"),
            _ => ("valider le plan d'actions de", (string?)null, "/pages/front/validations?tab=capa", "plan d'actions"),
        };

        await _notifications.NotifyValidatorsAsync(
            "validation_reminder",
            "Rappel : validation en attente",
            $"{who} vous rappelle de {what} {which}{waiting}.",
            permission,
            departmentId: item.DepartmentId,
            actionPlanId: item.Kind == Capa ? item.Id : null,
            claimId: item.ClaimId,
            linkPath: link,
            excludeUserId: me);

        _db.ValidationReminders.Add(new ValidationReminder { Kind = item.Kind, TargetId = item.Id, ClaimId = item.ClaimId, RequestedById = me, CreatedAt = now });
        await _db.SaveChangesAsync(ct);
        if (item.ClaimId.HasValue)
            await ClaimAudit.RecordAsync(_db, item.ClaimId.Value, "validation_reminder", me, $"Rappel envoyé aux validateurs : {label}.", ct);

        return Ok(new { sentAt = now, nextReminderAt = now + Cooldown });
    }

    /// <summary>The author corrected a plan the administrator sent back: it goes to the administrator again.</summary>
    [HttpPost("plans/{planId:guid}/resubmit")]
    public async Task<IActionResult> Resubmit(Guid planId, CancellationToken ct)
    {
        var me = UserId;
        if (string.IsNullOrWhiteSpace(me)) return Unauthorized();
        var plan = await _db.ActionPlans.FirstOrDefaultAsync(p => p.Id == planId && !p.IsArchived && (p.AssignedToId == me || p.OwnerId == me), ct);
        if (plan == null) return NotFound(new { code = "notFound", message = "Plan introuvable." });
        if (plan.ApprovalStatus != PlanApprovalStatus.Returned)
            return Conflict(new { code = "notReturned", message = "Ce plan n'a pas été renvoyé." });

        plan.ApprovalStatus = PlanApprovalStatus.Pending;
        plan.ApprovalComment = null;
        plan.ApprovalDecidedAt = null;
        plan.ApprovalDecidedById = null;
        await _db.SaveChangesAsync(ct);

        var who = User.FindFirst("name")?.Value ?? User.FindFirstValue(ClaimTypes.Name) ?? "Un employé";
        await _notifications.NotifyValidatorsAsync(
            "capa_submitted",
            "Plan d'actions à approuver",
            $"{who} a corrigé et soumis à nouveau le plan « {plan.Title} » : approuvez-le pour que ses actions puissent démarrer.",
            PermissionAccess.ValidateFiveWhy,
            departmentId: plan.DepartmentId,
            actionPlanId: plan.Id,
            claimId: plan.ClaimId,
            linkPath: "/pages/front/validations?tab=approval",
            excludeUserId: me);
        if (plan.ClaimId.HasValue)
            await ClaimAudit.RecordAsync(_db, plan.ClaimId.Value, "plan_resubmitted", me, plan.Title, ct);
        return Ok(new { ok = true });
    }
}
