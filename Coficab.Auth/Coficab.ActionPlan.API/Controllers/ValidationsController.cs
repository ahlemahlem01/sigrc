using System.Security.Claims;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The validation desk of the administrators: the 5 Why waiting for a decision in one request (it used to be one request per
/// claim), and the decision on several files at once, with the reason of a return kept in the claim's history and sent to
/// the people concerned.
/// </summary>
[ApiController]
[Route("api/validations")]
[Authorize(Roles = "admin,superadmin")]
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

    private string? UserId => User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    /// <summary>The 5 Why submitted and not decided yet, oldest first.</summary>
    [HttpGet("five-why")]
    public async Task<IActionResult> FiveWhyQueue(CancellationToken ct)
    {
        var rows = await (from a in _db.FiveWhyAnalyses.AsNoTracking()
                          join c in _db.Claims.AsNoTracking() on a.ClaimId equals c.Id
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
                              since = a.LastModifiedAt ?? a.CreatedAt,
                          }).ToListAsync(ct);
        return Ok(rows);
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
        var ids = request.ClaimIds.Distinct().Take(MaxBatch + 1).ToList();
        if (ids.Count == 0) return BadRequest(new { message = "Aucun dossier sélectionné." });
        if (ids.Count > MaxBatch) return BadRequest(new { message = $"{MaxBatch} dossiers au maximum à la fois." });
        var comment = request.Comment?.Trim();
        if (!request.Approve && string.IsNullOrWhiteSpace(comment))
            return BadRequest(new { message = "Le motif du renvoi est obligatoire." });

        var claims = await _db.Claims.AsNoTracking().Where(c => ids.Contains(c.Id))
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
                results.Add(new { id, ok = false, error = "Ce dossier n'est plus en attente de validation." });
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
        var comment = request.Comment?.Trim();
        if (string.IsNullOrWhiteSpace(comment)) return BadRequest(new { message = "Le motif du renvoi est obligatoire." });
        var claim = await _db.Claims.AsNoTracking().Where(c => c.Id == request.ClaimId)
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
}
