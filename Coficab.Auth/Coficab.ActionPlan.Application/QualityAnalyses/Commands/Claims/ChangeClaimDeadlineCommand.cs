using Coficab.ActionPlan.Application.Dashboard;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

public record ChangeClaimDeadlineCommand(Guid ClaimId, DateTime NewDeadline, string Reason, string ActorId) : IRequest<DeadlineExtensionResult>;

/// <summary>
/// An administrator sets a deadline of their own instead of the suggested one: earlier or later, with a mandatory reason.
/// The previous date (or its absence), the new date and the reason are saved with the audit event in one SaveChanges.
/// </summary>
public static class DeadlineChangeRules
{
    /// <summary>Null when allowed, otherwise a stable code the API returns and the screen translates.</summary>
    public static string? Check(DateTime? currentDeadline, DateTime newDeadline, DateTime today, string? reason)
    {
        var trimmed = (reason ?? string.Empty).Trim();
        if (trimmed.Length < DeadlineExtensionRules.MinReasonLength) return "reasonRequired";
        if (trimmed.Length > DeadlineExtensionRules.MaxReasonLength) return "reasonTooLong";
        if (newDeadline.Date < today.Date) return "newDateInPast";
        if (newDeadline.Date > today.Date.AddDays(DeadlineExtensionRules.MaxDaysAhead)) return "tooFar";
        if (currentDeadline.HasValue && currentDeadline.Value.Date == newDeadline.Date) return "sameDate";
        return null;
    }

    public static string Describe(DateTime? oldDeadline, DateTime newDeadline, string reason) =>
        $"{(oldDeadline.HasValue ? oldDeadline.Value.ToString("yyyy-MM-dd") : "—")} → {newDeadline:yyyy-MM-dd} · {reason.Trim()}";
}

public class ChangeClaimDeadlineCommandHandler : IRequestHandler<ChangeClaimDeadlineCommand, DeadlineExtensionResult>
{
    private readonly IApplicationDbContext _context;

    public ChangeClaimDeadlineCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<DeadlineExtensionResult> Handle(ChangeClaimDeadlineCommand request, CancellationToken cancellationToken)
    {
        var claim = await _context.Claims.FirstOrDefaultAsync(c => c.Id == request.ClaimId, cancellationToken);
        if (claim is null) return new("notFound");

        var status = claim.StatusCode ?? string.Empty;
        var open = !claim.IsArchived
                   && !status.Equals("CLOTUREE", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("CLOSED", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("CLOTURE", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("DRAFT", StringComparison.OrdinalIgnoreCase)
                   && !status.Equals("BROUILLON", StringComparison.OrdinalIgnoreCase);
        if (!open) return new("notOpen");

        var newDeadline = DateTime.SpecifyKind(request.NewDeadline.Date, DateTimeKind.Utc);
        var code = DeadlineChangeRules.Check(claim.Deadline, newDeadline, DateTime.UtcNow, request.Reason);
        if (code is not null) return new(code);

        var old = claim.Deadline;
        claim.Deadline = newDeadline;
        claim.UpdatedAt = DateTime.UtcNow;
        claim.UpdatedById = request.ActorId;

        _context.ClaimEvents.Add(new ClaimEvent
        {
            ClaimId = claim.Id,
            ActionType = "claim_deadline_changed",
            ActorId = request.ActorId,
            Detail = $"{claim.Title} · {DeadlineChangeRules.Describe(old, newDeadline, request.Reason)}",
            CreatedAt = DateTime.UtcNow,
        });

        await _context.SaveChangesAsync(cancellationToken);
        return new(null, old, newDeadline, old.HasValue ? DeadlineExtensionRules.ExtraDays(old.Value, newDeadline) : 0);
    }
}
