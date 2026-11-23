using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;

public record ClaimSheetEventDto(string ActionType, string ActorName, string? Detail, DateTime CreatedAt);

/// <summary>
/// The creation sheet of a claim: who created it, whether the creator confirmed it, whether the person asking may still edit it,
/// the suggested deadline and the trace of what was set or corrected. Editing is only possible for the creator, before the confirmation.
/// </summary>
public record ClaimCreationSheetDto(
    Guid ClaimId, string CreatorId, string CreatorName, bool IsCreator, bool Validated, DateTime? ValidatedAt, string? ValidatedByName,
    bool CanEdit, DateTime? SuggestedDeadline, DateTime? Deadline, string? AssigneeName, IReadOnlyList<ClaimSheetEventDto> History);

public record GetClaimCreationSheetQuery(Guid ClaimId, string ActorId) : IRequest<ClaimCreationSheetDto?>;

public class GetClaimCreationSheetQueryHandler : IRequestHandler<GetClaimCreationSheetQuery, ClaimCreationSheetDto?>
{
    private static readonly string[] SheetEvents =
    {
        "claim_created", ClaimCreationSheetRules.EditedEvent, "claim_deadline_set", "claim_deadline_changed", ClaimCreationSheetRules.ValidatedEvent,
    };

    private readonly IApplicationDbContext _context;

    public GetClaimCreationSheetQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ClaimCreationSheetDto?> Handle(GetClaimCreationSheetQuery request, CancellationToken ct)
    {
        var claim = await _context.Claims.AsNoTracking().FirstOrDefaultAsync(c => c.Id == request.ClaimId, ct);
        if (claim is null) return null;

        var profiles = await _context.UserProfiles.AsNoTracking().ToListAsync(ct);
        var aliases = await ClaimVisibility.AliasesAsync(_context, ct);
        string Name(string? id) => string.IsNullOrWhiteSpace(id) ? string.Empty : ClaimVisibility.PersonName(profiles, id, id, aliases) ?? id;

        var events = await _context.ClaimEvents.AsNoTracking()
            .Where(e => e.ClaimId == claim.Id && SheetEvents.Contains(e.ActionType))
            .OrderBy(e => e.CreatedAt)
            .ToListAsync(ct);
        var validated = events.FirstOrDefault(e => e.ActionType == ClaimCreationSheetRules.ValidatedEvent);
        var isCreator = ClaimCreationSheetRules.IsCreator(claim, request.ActorId);

        return new ClaimCreationSheetDto(
            claim.Id,
            claim.CreatedById ?? string.Empty,
            Name(claim.CreatedById),
            isCreator,
            validated is not null,
            validated?.CreatedAt,
            validated is null ? null : Name(validated.ActorId),
            CanEdit: isCreator && validated is null && ClaimCreationSheetRules.IsOpen(claim),
            ClaimCreationSheetRules.SuggestedDeadline(claim.CreatedAt, claim.EstimatedDaysP80),
            claim.Deadline,
            string.IsNullOrWhiteSpace(claim.AssignedToId) ? null : Name(claim.AssignedToId),
            events.Select(e => new ClaimSheetEventDto(e.ActionType, Name(e.ActorId), e.Detail, e.CreatedAt)).ToList());
    }
}
