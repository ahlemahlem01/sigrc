using System.Security.Claims;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The validation desk of the administrators: the 5 Why waiting for a decision in one request (it used to be one request per
/// claim), and the decision on several files at once, with the reason of a return kept in the claim's history and sent to
/// the people concerned. Open to the administrators and to the people whose function carries the right to validate; apart from the
/// superadmin, each one only sees the files of his own perimeter (his department).
/// </summary>
[ApiController]
[Route("api/validations")]
[Authorize]
public class ValidationsController : ControllerBase
{
    private const int MaxBatch = 200;

    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;
    private readonly INotificationService _notifications;

    public ValidationsController(IApplicationDbContext db, IMediator mediator, INotificationService notifications)
    {
        _db = db;
        _mediator = mediator;
        _notifications = notifications;
    }

    private Task<bool> CanAsync(string permission, CancellationToken ct) => PermissionAccess.HasAsync(User, HttpContext.RequestServices, permission, ct);

    /// <summary>The claims the caller may decide on: all for the superadmin, else his perimeter.</summary>
    private async Task<IQueryable<Coficab.ActionPlan.Core.Entities.Claim>> VisibleClaimsAsync(CancellationToken ct)
    {
        var query = _db.Claims.AsNoTracking();
        if (User.IsInRole("superadmin") || string.IsNullOrWhiteSpace(UserId)) return query;
        return await ClaimVisibility.ApplyAsync(_db, query, UserId, ct);
    }

    private string? UserId => User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    /// <summary>The 5 Why submitted and not decided yet, oldest first.</summary>
    [HttpGet("five-why")]
    public async Task<IActionResult> FiveWhyQueue(CancellationToken ct)
    {
        if (!await CanAsync(PermissionAccess.ValidateFiveWhy, ct)) return Forbid();
        var visible = await VisibleClaimsAsync(ct);
        var rows = await (from a in _db.FiveWhyAnalyses.AsNoTracking()
                          join c in visible on a.ClaimId equals c.Id
                          where !a.IsArchived && !c.IsArchived
                                && (a.StatusCode == "PENDING_VALIDATION" || a.StatusCode == "PENDING")
                          orderby a.LastModifiedAt ?? a.CreatedAt
                          select new
                          {
                              analysisId = a.Id,
                              claimId = c.Id,
                              claimTitle = c.Title,
                              reference = c.Reference,
                              clientId = c.ClientId,
                              defectType = c.DefectType,
                              productionLine = c.ProductionLine,
                              assignedToName = c.AssignedToName,
                              rootCause = a.RootCause,
                              rootCauseOccurrence = a.RootCauseOccurrence,
                              rootCauseDetection = a.RootCauseDetection,
                              since = a.LastModifiedAt ?? a.CreatedAt,
                          }).ToListAsync(ct);

        // the second step of the thread: where the action plan of each claim stands (the plan cannot exist before the root causes are validated)
        var claimIds = rows.Select(r => r.claimId).ToList();
        var plans = await _db.ActionPlans.AsNoTracking()
            .Where(p => p.ClaimId != null && claimIds.Contains(p.ClaimId.Value) && !p.IsArchived)
            .Select(p => new { ClaimId = p.ClaimId!.Value, p.Status, p.Progress, p.ApprovalStatus })
            .ToListAsync(ct);
        var planByClaim = plans.GroupBy(p => p.ClaimId).ToDictionary(g => g.Key, g => g.First());

        return Ok(rows.Select(r =>
        {
            var plan = planByClaim.GetValueOrDefault(r.claimId);
            return new
            {
                r.analysisId, r.claimId, r.claimTitle, r.reference, r.clientId, r.defectType, r.productionLine, r.assignedToName,
                r.rootCause, r.rootCauseOccurrence, r.rootCauseDetection, r.since,
                planStep = ValidationThread.PlanStep(plan?.Status, plan?.Progress ?? 0, plan?.ApprovalStatus ?? Coficab.ActionPlan.Core.Enums.PlanApprovalStatus.Approved),
                planProgress = plan?.Progress,
            };
        }));
    }

    public class DecideDossiersRequest
    {
        public List<Guid> ClaimIds { get; set; } = new();
        public bool Approve { get; set; }
        public string? Comment { get; set; }
    }

    /// <summary>
    /// Approves (the file opens) or returns (back to its author as a draft) the files waiting for validation. A return needs a
    /// reason. Each file is decided on its own: one that cannot be decided does not stop the others.
    /// </summary>
    [HttpPost("dossiers/decide")]
    public async Task<IActionResult> DecideDossiers([FromBody] DecideDossiersRequest request, CancellationToken ct)
    {
        if (!Guid.TryParse(UserId, out var actor)) return Unauthorized();
        if (!await CanAsync(PermissionAccess.ValidateEightD, ct)) return Forbid();
        var ids = request.ClaimIds.Distinct().Take(MaxBatch + 1).ToList();
        if (ids.Count == 0) return BadRequest(new { message = "Aucun dossier sélectionné." });
        if (ids.Count > MaxBatch) return BadRequest(new { message = $"{MaxBatch} dossiers au maximum à la fois." });
        var comment = request.Comment?.Trim();
        if (!request.Approve && string.IsNullOrWhiteSpace(comment))
            return BadRequest(new { message = "Le motif du renvoi est obligatoire." });

        var claims = await (await VisibleClaimsAsync(ct)).Where(c => ids.Contains(c.Id))
            .Select(c => new { c.Id, c.Title, c.StatusCode, c.AssignedToId, c.CreatedById, c.IsArchived })
            .ToListAsync(ct);
        var byId = claims.ToDictionary(c => c.Id);

        var results = new List<object>();
        foreach (var id in ids)
        {
            if (!byId.TryGetValue(id, out var claim) || claim.IsArchived)
            {
                results.Add(new { id, ok = false, error = "Dossier introuvable." });
                continue;
            }
            if (!string.Equals(claim.StatusCode, "PENDING_VALIDATION", StringComparison.OrdinalIgnoreCase))
            {
                results.Add(new { id, ok = false, error = await Coficab.ActionPlan.Application.QualityAnalyses.Services.DecisionTrace.AlreadyDecidedAsync(_db, id, "Ce dossier", "Ce dossier n'est plus en attente de validation.", null, null, ct) });
                continue;
            }
            try
            {
                var done = await _mediator.Send(new UpdateClaimCommand
                {
                    Id = id,
                    UpdatedById = actor,
                    StatusCode = request.Approve ? "OUVERTE" : "DRAFT",
                }, ct);
                if (!done)
                {
                    results.Add(new { id, ok = false, error = "Dossier introuvable." });
                    continue;
                }

                var type = request.Approve ? "claim_validation_approved" : "claim_validation_returned";
                await ClaimAudit.RecordAsync(_db, id, type, actor.ToString(), string.IsNullOrWhiteSpace(comment) ? claim.Title : $"{claim.Title} · {comment}", ct);

                var recipients = new[] { claim.CreatedById, claim.AssignedToId }
                    .Where(r => !string.IsNullOrWhiteSpace(r) && !string.Equals(r, actor.ToString(), StringComparison.OrdinalIgnoreCase))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                foreach (var recipient in recipients)
                {
                    await _notifications.NotifyAsync(
                        recipient!,
                        request.Approve ? "claim_approved" : "claim_returned",
                        request.Approve ? "Dossier validé" : "Dossier renvoyé",
                        request.Approve
                            ? $"Votre dossier « {claim.Title} » a été validé et peut être traité."
                            : $"Votre dossier « {claim.Title} » a été renvoyé : {comment}",
                        null,
                        request.Approve ? $"/pages/front/quality-analyses/8d/{id}" : "/pages/front/quality-analyses/drafts",
                        id);
                }
                results.Add(new { id, ok = true, error = (string?)null });
            }
            catch (Exception ex)
            {
                results.Add(new { id, ok = false, error = ex.Message });
            }
        }
        return Ok(new { results });
    }

    public class FiveWhyReturnRequest
    {
        public Guid ClaimId { get; set; }
        public string? Comment { get; set; }
    }

    /// <summary>Keeps the reason of a returned 5 Why in the claim's history and tells the people concerned.</summary>
    [HttpPost("five-why/returned")]
    public async Task<IActionResult> FiveWhyReturned([FromBody] FiveWhyReturnRequest request, CancellationToken ct)
    {
        if (!await CanAsync(PermissionAccess.ValidateFiveWhy, ct)) return Forbid();
        var comment = request.Comment?.Trim();
        if (string.IsNullOrWhiteSpace(comment)) return BadRequest(new { message = "Le motif du renvoi est obligatoire." });
        var claim = await (await VisibleClaimsAsync(ct)).Where(c => c.Id == request.ClaimId)
            .Select(c => new { c.Id, c.Title, c.AssignedToId, c.CreatedById }).FirstOrDefaultAsync(ct);
        if (claim == null) return NotFound(new { message = "Dossier introuvable." });

        await ClaimAudit.RecordAsync(_db, claim.Id, "fivewhy_returned", UserId, $"{claim.Title} · {comment}", ct);
        foreach (var recipient in new[] { claim.AssignedToId, claim.CreatedById }
                     .Where(r => !string.IsNullOrWhiteSpace(r) && !string.Equals(r, UserId, StringComparison.OrdinalIgnoreCase))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await _notifications.NotifyAsync(
                recipient!, "fivewhy_rejected", "5 Pourquoi renvoyé",
                $"Votre analyse 5 Pourquoi sur « {claim.Title} » a été renvoyée : {comment}",
                null, $"/pages/front/quality-analyses/5why/{claim.Id}", claim.Id);
        }
        return Ok(new { ok = true });
    }

    // ─── Approval of the action plans, before their execution ───────────────────────────

    /// <summary>The plans built from a 5 Why that wait for the administrator's approval, oldest first.</summary>
    [HttpGet("plans/approval")]
    public async Task<IActionResult> PlansToApprove(CancellationToken ct)
    {
        if (!await CanAsync(PermissionAccess.ValidateFiveWhy, ct)) return Forbid();
        var visible = await VisibleClaimsAsync(ct);
        var rows = await (from p in _db.ActionPlans.AsNoTracking()
                          join c in visible on p.ClaimId equals c.Id
                          where !p.IsArchived && p.ApprovalStatus == Coficab.ActionPlan.Core.Enums.PlanApprovalStatus.Pending
                          orderby p.CreatedAt
                          select new
                          {
                              planId = p.Id,
                              p.Reference,
                              p.Title,
                              p.Description,
                              type = (int)p.Type,
                              status = (int)p.Status,
                              progress = p.Progress,
                              p.Deadline,
                              claimId = c.Id,
                              claimTitle = c.Title,
                              claimReference = c.Reference,
                              assignedToName = c.AssignedToName,
                              since = p.CreatedAt,
                              actions = p.PlanActions.Where(a => !a.IsArchived).OrderBy(a => a.Order)
                                  .Select(a => new { a.Title, a.Description, a.Deadline }).ToList(),
                          }).ToListAsync(ct);
        return Ok(rows);
    }

    public class PlanDecisionRequest
    {
        public string? Comment { get; set; }
    }


    private async Task<(Coficab.ActionPlan.Core.Entities.ActionPlan? Plan, IActionResult? Error)> PlanToDecideAsync(Guid id, CancellationToken ct)
    {
        if (!await CanAsync(PermissionAccess.ValidateFiveWhy, ct)) return (null, Forbid());
        var visible = await VisibleClaimsAsync(ct);
        var plan = await _db.ActionPlans.FirstOrDefaultAsync(p => p.Id == id && !p.IsArchived, ct);
        if (plan == null || plan.ClaimId == null || !await visible.AnyAsync(c => c.Id == plan.ClaimId, ct))
            return (null, NotFound(new { code = "notFound", message = "Plan introuvable." }));
        if (plan.ApprovalStatus != Coficab.ActionPlan.Core.Enums.PlanApprovalStatus.Pending)
            return (null, Conflict(new { code = "notPending", message = "Ce plan n'attend plus d'approbation." }));
        var me = UserId;
        bool Same(string? other) => !string.IsNullOrWhiteSpace(me) && !string.IsNullOrWhiteSpace(other) && string.Equals(other.Trim(), me.Trim(), StringComparison.OrdinalIgnoreCase);
        if (Same(plan.OwnerId) || Same(plan.CreatedBy) || Same(plan.AssignedToId))
            return (null, Conflict(new { code = "selfApproval", message = "Vous ne pouvez pas approuver un plan que vous avez soumis : un autre administrateur doit le faire." }));
        return (plan, null);
    }

    private async Task TellAuthorsAsync(Coficab.ActionPlan.Core.Entities.ActionPlan plan, string type, string title, string message, CancellationToken ct)
    {
        foreach (var recipient in new[] { plan.AssignedToId, plan.OwnerId, plan.CreatedBy }
                     .Where(r => !string.IsNullOrWhiteSpace(r) && !string.Equals(r, UserId, StringComparison.OrdinalIgnoreCase))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await _notifications.NotifyAsync(recipient!, type, title, message, plan.Id, $"/pages/front/my-action-plans/{plan.Id}", plan.ClaimId);
        }
    }

    /// <summary>Approves the plan: its actions can now be carried out.</summary>
    [HttpPost("plans/{id:guid}/approve")]
    public async Task<IActionResult> ApprovePlan(Guid id, [FromBody] PlanDecisionRequest? request, CancellationToken ct)
    {
        var (plan, error) = await PlanToDecideAsync(id, ct);
        if (error != null) return error;
        var comment = request?.Comment?.Trim();

        plan!.ApprovalStatus = Coficab.ActionPlan.Core.Enums.PlanApprovalStatus.Approved;
        // approved: the plan can now be carried out (until then it is "not started")
        if (plan.Status == Coficab.ActionPlan.Core.Enums.ActionPlanStatus.Created) plan.Status = Coficab.ActionPlan.Core.Enums.ActionPlanStatus.Ongoing;
        plan.ApprovalDecidedById = UserId;
        plan.ApprovalDecidedAt = DateTime.UtcNow;
        plan.ApprovalComment = string.IsNullOrWhiteSpace(comment) ? null : comment;
        await _db.SaveChangesAsync(ct);

        if (plan.ClaimId.HasValue)
            await ClaimAudit.RecordAsync(_db, plan.ClaimId.Value, "plan_approved", UserId, $"{plan.Title}" + (string.IsNullOrWhiteSpace(comment) ? string.Empty : $" · {comment}"), ct);
        await TellAuthorsAsync(plan, "plan_approved", "Plan d'actions approuvé",
            $"Votre plan « {plan.Title} » est approuvé : vous pouvez démarrer ses actions." + (string.IsNullOrWhiteSpace(comment) ? string.Empty : $" Remarque : {comment}"), ct);
        return Ok(new { ok = true });
    }

    /// <summary>Sends the plan back to its author, with the reason; the author corrects it and submits it again.</summary>
    [HttpPost("plans/{id:guid}/return")]
    public async Task<IActionResult> ReturnPlan(Guid id, [FromBody] PlanDecisionRequest? request, CancellationToken ct)
    {
        var comment = request?.Comment?.Trim();
        if (string.IsNullOrWhiteSpace(comment)) return BadRequest(new { code = "commentRequired", message = "Le motif du renvoi est obligatoire." });
        var (plan, error) = await PlanToDecideAsync(id, ct);
        if (error != null) return error;

        plan!.ApprovalStatus = Coficab.ActionPlan.Core.Enums.PlanApprovalStatus.Returned;
        plan.ApprovalDecidedById = UserId;
        plan.ApprovalDecidedAt = DateTime.UtcNow;
        plan.ApprovalComment = comment.Length > 1000 ? comment[..1000] : comment;
        await _db.SaveChangesAsync(ct);

        if (plan.ClaimId.HasValue)
            await ClaimAudit.RecordAsync(_db, plan.ClaimId.Value, "plan_returned", UserId, $"{plan.Title} · {comment}", ct);
        await TellAuthorsAsync(plan, "plan_returned", "Plan d'actions renvoyé",
            $"Votre plan « {plan.Title} » a été renvoyé : {comment}. Corrigez-le puis soumettez-le à nouveau.", ct);
        return Ok(new { ok = true });
    }
}
