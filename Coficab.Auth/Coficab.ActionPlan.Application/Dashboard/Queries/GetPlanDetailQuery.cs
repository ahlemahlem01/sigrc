using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Dashboard.Queries;

public record PlanPersonDto(string? UserId, string Name);

public record PlanClaimDto(Guid Id, string Title, string ClientId, string Severity, string StatusCode);

public record PlanActionRowDto(
    Guid Id,
    string Title,
    string? Description,
    int Priority,
    /// <summary>0-100 for the bar (validated counts as 100, cancelled as 0).</summary>
    int Progress,
    /// <summary>open | waitingValidation | validated | cancelled</summary>
    string State,
    DateTime? Deadline,
    int LateDays,
    PlanPersonDto Responsible);

public record PlanEventDto(DateTime At, string Type, string By, string? Note, string? FromStatus, string? ToStatus, string? FromAssignee, string? ToAssignee);

public record PlanHealthDto(
    /// <summary>late | onTrack | noDeadline | closedOnTime | closedLate | closed</summary>
    string State,
    int LateDays,
    int OpenActions,
    int LateActions,
    int WaitingValidation,
    int ProofCount);

public record PlanDetailDto(
    Guid Id,
    string Title,
    string? Description,
    string Type,
    string Status,
    Guid OrganizationId,
    string OrganizationName,
    Guid DepartmentId,
    string DepartmentName,
    PlanPersonDto Responsible,
    PlanPersonDto CreatedBy,
    DateTime CreatedAt,
    DateTime? Deadline,
    DateTime? CompletedAt,
    int Progress,
    PlanHealthDto Health,
    PlanClaimDto? Claim,
    IReadOnlyList<PlanActionRowDto> Actions,
    IReadOnlyList<PlanEventDto> History,
    /// <summary>The last time the plan was sent back at validation, and why.</summary>
    DateTime? LastRejectedAt,
    string? LastRejectComment);

public record GetPlanDetailQuery(Guid PlanId) : IRequest<PlanDetailDto?>;

/// <summary>Everything the plan page shows in one call, with the same definition of late as the dashboards.</summary>
public class GetPlanDetailQueryHandler : IRequestHandler<GetPlanDetailQuery, PlanDetailDto?>
{
    private const int HistoryShown = 40;
    private readonly IApplicationDbContext _context;

    public GetPlanDetailQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PlanDetailDto?> Handle(GetPlanDetailQuery request, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var plan = await _context.ActionPlans.AsNoTracking()
            .Include(p => p.PlanActions).ThenInclude(a => a.Documents)
            .Include(p => p.Department).Include(p => p.Organization)
            .FirstOrDefaultAsync(p => p.Id == request.PlanId, ct);
        if (plan == null) return null;

        var profiles = await _context.UserProfiles.AsNoTracking().ToListAsync(ct);
        var aliases = await ClaimVisibility.AliasesAsync(_context, ct);
        PlanPersonDto Person(string? id)
            => string.IsNullOrWhiteSpace(id) ? new PlanPersonDto(null, string.Empty) : new PlanPersonDto(id, ClaimVisibility.PersonName(profiles, id, null, aliases));

        var actions = plan.PlanActions.Where(a => !a.IsArchived).OrderBy(a => a.Order ?? int.MaxValue).ThenBy(a => a.CreatedAt).ToList();
        var rows = actions.Select(a =>
        {
            var state = a.Progress switch
            {
                ActionProgress.Validated => "validated",
                ActionProgress.Cancelled => "cancelled",
                ActionProgress.Hundred => "waitingValidation",
                _ => "open",
            };
            var late = !PlanDeadlines.IsFinished(a) && a.Deadline.HasValue ? Math.Max(0, (today - a.Deadline.Value.Date).Days) : 0;
            var progress = a.Progress switch { ActionProgress.Validated => 100, ActionProgress.Cancelled => 0, _ => (int)a.Progress };
            return new PlanActionRowDto(a.Id, a.Title, a.Description, a.Priority, progress, state, a.Deadline, late, Person(a.AssignedToId));
        }).ToList();

        var open = PlanDeadlines.IsOpen(plan);
        var lateDays = PlanDeadlines.MaxLagDays(plan, today);
        var closed = plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived;
        var state = closed
            ? (plan.IsOnTime == true ? "closedOnTime" : plan.IsOnTime == false ? "closedLate" : "closed")
            : lateDays > 0 ? "late"
            : plan.Deadline == null && actions.All(a => a.Deadline == null) ? "noDeadline"
            : "onTrack";
        var health = new PlanHealthDto(
            state,
            lateDays,
            rows.Count(r => r.State is "open" or "waitingValidation"),
            rows.Count(r => r.LateDays > 0),
            rows.Count(r => r.State == "waitingValidation"),
            actions.Sum(a => a.Documents.Count(d => !d.IsArchived)));

        PlanClaimDto? claim = null;
        if (plan.ClaimId is { } claimId)
        {
            var c = await _context.Claims.AsNoTracking().FirstOrDefaultAsync(x => x.Id == claimId, ct);
            if (c != null) claim = new PlanClaimDto(c.Id, c.Title, c.ClientId, c.Severity, c.StatusCode);
        }

        var history = (await _context.ActionPlanHistories.AsNoTracking().IgnoreQueryFilters()
                .Where(h => h.ActionPlanId == plan.Id).OrderByDescending(h => h.CreatedAt).Take(HistoryShown).ToListAsync(ct))
            .Select(h => new PlanEventDto(
                h.CreatedAt, h.ActionType, Person(h.ChangedBy).Name is { Length: > 0 } n ? n : (h.ChangedByName ?? string.Empty), h.Note,
                h.OldStatus?.ToString(), h.NewStatus?.ToString(),
                string.IsNullOrWhiteSpace(h.OldAssignedToId) ? h.OldAssignedToName : Person(h.OldAssignedToId).Name,
                string.IsNullOrWhiteSpace(h.NewAssignedToId) ? h.NewAssignedToName : Person(h.NewAssignedToId).Name))
            .ToList();

        var lastRejection = await _context.ActionPlanHistories.AsNoTracking().IgnoreQueryFilters()
            .Where(h => h.ActionPlanId == plan.Id && h.ActionType == "rejected")
            .OrderByDescending(h => h.CreatedAt).Select(h => new { h.CreatedAt, h.Note }).FirstOrDefaultAsync(ct);

        return new PlanDetailDto(
            plan.Id, plan.Title, plan.Description, plan.Type.ToString(), plan.Status.ToString(),
            plan.OrganizationId, plan.Organization?.Name ?? string.Empty, plan.DepartmentId, plan.Department?.Name ?? string.Empty,
            Person(plan.AssignedToId), Person(plan.CreatedBy), plan.CreatedAt, plan.Deadline, plan.CompletedAt,
            Math.Clamp(plan.Progress, 0, 100), health, claim, rows, history, lastRejection?.CreatedAt, lastRejection?.Note);
    }
}
