using System.Security.Claims;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;

namespace Coficab.ActionPlan.API.Controllers;

public record PlanCommentRequest(string? Body);

/// <summary>
/// Comments on an action plan, for administrators and for the people who work on the plan. Posting a comment notifies the others
/// involved in the plan (owner, creator, person in charge, assignees of its actions, whoever assigned it, earlier commenters).
/// </summary>
[ApiController]
[Route("api/ActionPlan/{planId:guid}/comments")]
[Authorize]
public class PlanCommentsController : ControllerBase
{
    private const int MaxLength = 2000;
    private static readonly string[] AdminRoles = { "admin", "superadmin", "admin_quality" };

    private readonly IApplicationDbContext _db;
    private readonly IActionPlanService _plans;
    private readonly INotificationService _notifications;
    private readonly ILogger<PlanCommentsController> _logger;

    public PlanCommentsController(IApplicationDbContext db, IActionPlanService plans, INotificationService notifications, ILogger<PlanCommentsController> logger)
    {
        _db = db;
        _plans = plans;
        _notifications = notifications;
        _logger = logger;
    }

    private string? CurrentUserId() =>
        User.FindFirst(OpenIddictConstants.Claims.Subject)?.Value
        ?? User.FindFirst("sub")?.Value
        ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private bool IsAdmin() =>
        User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Any(r => AdminRoles.Contains(r));

    private static bool IsAdminRole(string? role) => AdminRoles.Contains((role ?? string.Empty).Trim().ToLowerInvariant());

    /// <summary>The plan when the caller may see it: an administrator, or someone the plan is assigned to / who works on it.</summary>
    private async Task<Core.Entities.ActionPlan?> VisiblePlanAsync(Guid planId, string userId, CancellationToken ct)
    {
        var plan = await _db.ActionPlans.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.Id == planId, ct);
        if (plan is null) return null;
        if (IsAdmin()) return plan;
        return await _plans.GetAssignedPlanByIdAsync(planId, userId) != null ? plan : null;
    }

    private async Task<object> ViewAsync(IReadOnlyCollection<ActionPlanComment> comments, string userId, CancellationToken ct)
    {
        var ids = comments.Select(c => c.AuthorId).Distinct().ToList();
        var profiles = await _db.UserProfiles.AsNoTracking().Where(u => ids.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, StringComparer.OrdinalIgnoreCase, ct);
        var admin = IsAdmin();
        return comments.Select(c =>
        {
            profiles.TryGetValue(c.AuthorId, out var profile);
            var mine = string.Equals(c.AuthorId, userId, StringComparison.OrdinalIgnoreCase);
            return new
            {
                c.Id,
                c.AuthorId,
                AuthorName = profile?.Name is { Length: > 0 } name ? name : "—",
                AuthorRole = IsAdminRole(profile?.Role) ? "admin" : "employee",
                c.Body,
                c.CreatedAt,
                c.EditedAt,
                Mine = mine,
                CanEdit = mine,
                CanDelete = mine || admin,
            };
        }).ToList();
    }

    private static string? Clean(string? body)
    {
        var text = (body ?? string.Empty).Trim();
        return text.Length == 0 || text.Length > MaxLength ? null : text;
    }

    private static string Preview(string body) => body.Length <= 140 ? body : body[..139].TrimEnd() + "…";

    [HttpGet]
    public async Task<IActionResult> List(Guid planId, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });
        if (await VisiblePlanAsync(planId, userId, ct) is null) return NotFound(new { error = "Plan d'action non trouvé ou non accessible." });

        var comments = await _db.ActionPlanComments.AsNoTracking().Where(c => c.ActionPlanId == planId && !c.IsArchived).OrderBy(c => c.CreatedAt).ToListAsync(ct);
        return Ok(await ViewAsync(comments, userId, ct));
    }

    [HttpPost]
    public async Task<IActionResult> Add(Guid planId, [FromBody] PlanCommentRequest request, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });
        var plan = await VisiblePlanAsync(planId, userId, ct);
        if (plan is null) return NotFound(new { error = "Plan d'action non trouvé ou non accessible." });
        if (plan.IsArchived) return Conflict(new { error = "Ce plan est archivé : on ne peut plus le commenter." });

        var body = Clean(request.Body);
        if (body is null) return BadRequest(new { error = $"Le commentaire doit contenir entre 1 et {MaxLength} caractères." });

        var now = DateTime.UtcNow;
        var comment = new ActionPlanComment { ActionPlanId = planId, AuthorId = userId, Body = body, CreatedAt = now, CreatedBy = userId, UpdatedAt = now, UpdatedBy = userId };
        _db.ActionPlanComments.Add(comment);
        // the comment also shows in the history of the plan
        _db.ActionPlanHistories.Add(new ActionPlanHistory
        {
            ActionPlanId = planId, ChangedBy = userId, ActionType = "comment_added", Note = Preview(body),
            CreatedAt = now, CreatedBy = userId, UpdatedAt = now, UpdatedBy = userId,
        });
        await _db.SaveChangesAsync(ct);

        await NotifyOthersAsync(plan, userId, body, ct);

        var view = await ViewAsync(new[] { comment }, userId, ct);
        return Ok(((IEnumerable<object>)view).First());
    }

    [HttpPut("{commentId:guid}")]
    public async Task<IActionResult> Edit(Guid planId, Guid commentId, [FromBody] PlanCommentRequest request, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });
        if (await VisiblePlanAsync(planId, userId, ct) is null) return NotFound(new { error = "Plan d'action non trouvé ou non accessible." });

        var comment = await _db.ActionPlanComments.FirstOrDefaultAsync(c => c.Id == commentId && c.ActionPlanId == planId && !c.IsArchived, ct);
        if (comment is null) return NotFound();
        if (!string.Equals(comment.AuthorId, userId, StringComparison.OrdinalIgnoreCase)) return Forbid();

        var body = Clean(request.Body);
        if (body is null) return BadRequest(new { error = $"Le commentaire doit contenir entre 1 et {MaxLength} caractères." });

        comment.Body = body;
        comment.EditedAt = DateTime.UtcNow;
        comment.UpdatedAt = comment.EditedAt;
        comment.UpdatedBy = userId;
        await _db.SaveChangesAsync(ct);
        return Ok(((IEnumerable<object>)await ViewAsync(new[] { comment }, userId, ct)).First());
    }

    /// <summary>Archives a comment (its author or an administrator). Nothing is deleted.</summary>
    [HttpDelete("{commentId:guid}")]
    public async Task<IActionResult> Archive(Guid planId, Guid commentId, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { error = "Utilisateur non authentifié." });
        if (await VisiblePlanAsync(planId, userId, ct) is null) return NotFound(new { error = "Plan d'action non trouvé ou non accessible." });

        var comment = await _db.ActionPlanComments.FirstOrDefaultAsync(c => c.Id == commentId && c.ActionPlanId == planId && !c.IsArchived, ct);
        if (comment is null) return NotFound();
        if (!IsAdmin() && !string.Equals(comment.AuthorId, userId, StringComparison.OrdinalIgnoreCase)) return Forbid();

        comment.IsArchived = true;
        comment.ArchivedAt = DateTime.UtcNow;
        comment.ArchivedBy = userId;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Tells the people involved in the plan (not the author) that a comment was posted; each one gets a link to the page that fits their role.</summary>
    private async Task NotifyOthersAsync(Core.Entities.ActionPlan plan, string authorId, string body, CancellationToken ct)
    {
        try
        {
            var involved = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            void Add(string? id) { if (!string.IsNullOrWhiteSpace(id)) involved.Add(id.Trim()); }
            Add(plan.AssignedToId); Add(plan.OwnerId); Add(plan.CreatedBy);
            foreach (var a in await _db.PlanActions.AsNoTracking().Where(a => a.ActionPlanId == plan.Id && !a.IsArchived && a.AssignedToId != null).Select(a => a.AssignedToId).Distinct().ToListAsync(ct)) Add(a);
            foreach (var a in await _db.UserActionPlanAssignments.AsNoTracking().Where(a => a.ActionPlanId == plan.Id).Select(a => new { a.UserId, a.AssignedBy }).ToListAsync(ct)) { Add(a.UserId); Add(a.AssignedBy); }
            foreach (var c in await _db.ActionPlanComments.AsNoTracking().Where(c => c.ActionPlanId == plan.Id && !c.IsArchived).Select(c => c.AuthorId).Distinct().ToListAsync(ct)) Add(c);
            involved.RemoveWhere(id => string.Equals(id, authorId, StringComparison.OrdinalIgnoreCase));

            // only real accounts (an owner such as "system" has no profile)
            var ids = involved.ToList();
            var profiles = await _db.UserProfiles.AsNoTracking().Where(u => ids.Contains(u.UserId)).ToListAsync(ct);
            var author = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == authorId, ct);
            var who = author?.Name is { Length: > 0 } n ? n : "Un utilisateur";

            // an employee's comment must not go unread: when no administrator is involved in the plan (a plan the employee opened
            // themselves), the administrators are told
            var authorIsAdmin = IsAdminRole(author?.Role) || IsAdmin();
            if (!authorIsAdmin && !profiles.Any(p => IsAdminRole(p.Role)))
                await _notifications.NotifyAdminsAsync("plan_comment", "Nouveau commentaire", $"{who} a commenté « {plan.Title} » : {Preview(body)}",
                    plan.Id, linkPath: $"/pages/front/action-plans/{plan.Id}", excludeUserId: authorId);

            foreach (var profile in profiles)
            {
                var link = IsAdminRole(profile.Role) ? $"/pages/front/action-plans/{plan.Id}" : $"/pages/front/my-action-plans/{plan.Id}";
                await _notifications.NotifyAsync(profile.UserId, "plan_comment", "Nouveau commentaire",
                    $"{who} a commenté « {plan.Title} » : {Preview(body)}", plan.Id, link);
            }
        }
        catch (Exception ex)
        {
            // the comment is saved: a notification problem must not turn it into an error
            _logger.LogWarning(ex, "Comment notifications failed for plan {PlanId}", plan.Id);
        }
    }
}
