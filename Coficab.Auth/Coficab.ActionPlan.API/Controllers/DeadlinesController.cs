using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// Every deadline an administrator follows (claims, CAPA plans, sub-actions) in one request: all that is still open, plus what
/// closed in the last <see cref="HistoryDays"/> days. It used to be built in the browser from the whole list of claims and one
/// request per plan, which was slow and missed the actions of most plans.
/// </summary>
[ApiController]
[Route("api/admin/deadlines")]
[Authorize(Roles = "admin,superadmin")]
public class DeadlinesController : ControllerBase
{
    private const int HistoryDays = 90;
    private const int MaxItems = 6000;

    private static readonly string[] ClosedClaim = { "CLOTUREE", "CLOSED", "VALIDATED", "ARCHIVED" };

    private readonly IApplicationDbContext _db;

    public DeadlinesController(IApplicationDbContext db) => _db = db;

    public record DeadlineItemDto(
        string Id, string Kind, string Title, string? Reference, string? Subtitle, string? AssigneeId, string? AssigneeName,
        DateTime Deadline, bool Closed, string? StatusCode, Guid? PlanId);

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? organizationIds = null, [FromQuery] Guid? departmentId = null, CancellationToken ct = default)
    {
        var scope = await AdminScope.ResolveAsync(_db, organizationIds, departmentId, ct);
        var since = DateTime.UtcNow.AddDays(-HistoryDays);

        var names = (await _db.UserProfiles.AsNoTracking().Select(u => new { u.UserId, u.Name }).ToListAsync(ct))
            .GroupBy(u => u.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Name, StringComparer.OrdinalIgnoreCase);
        string? NameOf(string? id) => !string.IsNullOrWhiteSpace(id) && names.TryGetValue(id, out var n) ? n : null;

        var items = new List<DeadlineItemDto>();

        var claims = await (await scope.ClaimsAsync(_db, ct))
            .Where(c => c.Deadline != null)
            .Select(c => new { c.Id, c.Title, c.Reference, c.DefectType, c.StatusCode, c.AssignedToId, c.AssignedToName, c.Deadline })
            .ToListAsync(ct);
        foreach (var c in claims)
        {
            var closed = ClosedClaim.Contains((c.StatusCode ?? string.Empty).ToUpperInvariant());
            if (closed && c.Deadline < since) continue;
            items.Add(new DeadlineItemDto($"claim-{c.Id}", "claim", c.Title, c.Reference, c.DefectType, c.AssignedToId,
                c.AssignedToName ?? NameOf(c.AssignedToId), c.Deadline!.Value, closed, c.StatusCode, null));
        }

        var plans = await scope.Plans(_db)
            .Select(p => new { p.Id, p.Title, p.Reference, p.Status, p.Progress, p.AssignedToId, p.OwnerId, p.Deadline })
            .ToListAsync(ct);
        var planTitles = plans.ToDictionary(p => p.Id, p => p.Title);
        foreach (var p in plans.Where(p => p.Deadline != null))
        {
            var closed = p.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived || p.Progress >= 100;
            if (closed && p.Deadline < since) continue;
            var who = !string.IsNullOrWhiteSpace(p.AssignedToId) ? p.AssignedToId : p.OwnerId;
            items.Add(new DeadlineItemDto($"plan-{p.Id}", "plan", p.Title, p.Reference, null, who, NameOf(who), p.Deadline!.Value, closed, null, null));
        }

        // Sub-actions of the plans in scope.
        var planIds = plans.Select(p => p.Id).ToList();
        var actions = await _db.PlanActions.AsNoTracking()
            .Where(a => !a.IsArchived && a.Deadline != null && planIds.Contains(a.ActionPlanId))
            .Select(a => new { a.Id, a.Title, a.ActionPlanId, a.AssignedToId, a.Deadline, Progress = (int)a.Progress })
            .ToListAsync(ct);
        foreach (var a in actions)
        {
            var closed = a.Progress >= 100;
            if (closed && a.Deadline < since) continue;
            items.Add(new DeadlineItemDto($"action-{a.Id}", "action", a.Title, null,
                planTitles.TryGetValue(a.ActionPlanId, out var pt) ? pt : null, a.AssignedToId, NameOf(a.AssignedToId), a.Deadline!.Value, closed, null, a.ActionPlanId));
        }

        return Ok(new { generatedAt = DateTime.UtcNow, items = items.OrderBy(i => i.Closed).ThenBy(i => i.Deadline).Take(MaxItems) });
    }
}
