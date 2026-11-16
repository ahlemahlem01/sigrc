using Coficab.ActionPlan.Application.Dashboard;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

/// <summary>What the person who created the claim may correct on the creation sheet. A null field is left as it is.</summary>
public class ClaimSheetChanges
{
    public string? Title { get; set; }
    public string? ClientId { get; set; }
    public string? DefectType { get; set; }
    public string? LotNumber { get; set; }
    public string? SerialNumber { get; set; }
    public string? Description { get; set; }
    public string? Severity { get; set; }
    public int? ProducedQuantity { get; set; }
    public int? DefectiveQuantity { get; set; }
}

/// <summary>
/// The creator confirms the claim they just declared. They may correct any field and choose the deadline (by default the date the model
/// suggests: creation date + P80). Every change goes to the claim history with the old and the new value; the confirmation closes the sheet.
/// </summary>
/// <param name="Deadline">Null = the creator did not touch the date: the suggested one is used (or the existing one is kept).</param>
public record ValidateClaimCreationCommand(Guid ClaimId, string ActorId, ClaimSheetChanges? Changes, DateTime? Deadline, string? DeadlineReason)
    : IRequest<ClaimCreationValidationResult>;

public record ClaimCreationValidationResult(string? Code, DateTime? Deadline = null);

public static class ClaimCreationSheetRules
{
    public const string ValidatedEvent = "claim_creation_validated";
    public const string EditedEvent = "claim_creation_edited";

    /// <summary>The date the model suggests: creation day + ceil(P80) calendar days (same rule as the screens).</summary>
    public static DateTime? SuggestedDeadline(DateTime createdAt, double? daysP80) =>
        daysP80.HasValue && double.IsFinite(daysP80.Value)
            ? DateTime.SpecifyKind(createdAt.Date.AddDays(Math.Max(0, Math.Ceiling(daysP80.Value))), DateTimeKind.Utc)
            : null;

    public static bool IsOpen(Claim claim)
    {
        var status = claim.StatusCode ?? string.Empty;
        return !claim.IsArchived
               && !status.Equals("CLOTUREE", StringComparison.OrdinalIgnoreCase)
               && !status.Equals("CLOSED", StringComparison.OrdinalIgnoreCase)
               && !status.Equals("CLOTURE", StringComparison.OrdinalIgnoreCase)
               && !status.Equals("DRAFT", StringComparison.OrdinalIgnoreCase)
               && !status.Equals("BROUILLON", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsCreator(Claim claim, string? actorId) =>
        !string.IsNullOrWhiteSpace(actorId) && string.Equals((claim.CreatedById ?? string.Empty).Trim(), actorId.Trim(), StringComparison.OrdinalIgnoreCase);

    private static string Short(string? value, int max = 80)
    {
        var v = (value ?? string.Empty).Trim().Replace('\n', ' ');
        return v.Length <= max ? v : v[..max] + "…";
    }

    /// <summary>"field: old → new", one per change, joined by " ; " (the screen translates the field names).</summary>
    public static string Describe(IEnumerable<(string Field, string? Old, string? New)> changes) =>
        string.Join(" ; ", changes.Select(c => $"{c.Field}: {(string.IsNullOrWhiteSpace(c.Old) ? "—" : Short(c.Old))} → {(string.IsNullOrWhiteSpace(c.New) ? "—" : Short(c.New))}"));
}

public class ValidateClaimCreationCommandHandler : IRequestHandler<ValidateClaimCreationCommand, ClaimCreationValidationResult>
{
    private readonly IApplicationDbContext _context;
    private readonly IClaimResolutionEstimateService _estimator;

    public ValidateClaimCreationCommandHandler(IApplicationDbContext context, IClaimResolutionEstimateService estimator)
    {
        _context = context;
        _estimator = estimator;
    }

    public async Task<ClaimCreationValidationResult> Handle(ValidateClaimCreationCommand request, CancellationToken ct)
    {
        var claim = await _context.Claims.FirstOrDefaultAsync(c => c.Id == request.ClaimId, ct);
        if (claim is null) return new("notFound");
        if (!ClaimCreationSheetRules.IsCreator(claim, request.ActorId)) return new("notCreator");
        if (!ClaimCreationSheetRules.IsOpen(claim)) return new("notOpen");
        if (await _context.ClaimEvents.AnyAsync(e => e.ClaimId == claim.Id && e.ActionType == ClaimCreationSheetRules.ValidatedEvent, ct))
            return new("alreadyValidated");

        var now = DateTime.UtcNow;
        var changes = new List<(string Field, string? Old, string? New)>();
        var changed = request.Changes;
        var estimateInputsChanged = false;

        if (changed is not null)
        {
            string? Pick(string? value, string? current) => string.IsNullOrWhiteSpace(value) || string.Equals(value.Trim(), (current ?? string.Empty).Trim(), StringComparison.Ordinal) ? null : value.Trim();

            if (Pick(changed.Title, claim.Title) is { } title) { changes.Add(("title", claim.Title, title)); claim.Title = title; }

            if (Pick(changed.ClientId, claim.ClientId) is { } client)
            {
                await StrictLists.EnsureAllowedAsync(_context, ReferenceListKeys.Client, client, "Le client", ct);
                changes.Add(("client", claim.ClientId, client)); claim.ClientId = client; estimateInputsChanged = true;
            }

            if (!string.IsNullOrWhiteSpace(changed.DefectType))
            {
                var defect = (await DefectTypeResolver.LoadAsync(_context, ct)).Resolve(changed.DefectType.Trim());
                if (!string.Equals(defect, claim.DefectType, StringComparison.Ordinal))
                {
                    changes.Add(("defect", claim.DefectType, defect)); claim.DefectType = defect; estimateInputsChanged = true;
                }
            }

            if (!string.IsNullOrWhiteSpace(changed.Severity) && !string.Equals(changed.Severity.Trim(), claim.Severity, StringComparison.OrdinalIgnoreCase))
            {
                changes.Add(("severity", claim.Severity, changed.Severity.Trim())); claim.Severity = changed.Severity.Trim(); estimateInputsChanged = true;
            }

            if (Pick(changed.LotNumber, claim.LotNumber) is { } lot) { changes.Add(("lot", claim.LotNumber, lot)); claim.LotNumber = lot; }
            if (Pick(changed.SerialNumber, claim.SerialNumber) is { } serial) { changes.Add(("serial", claim.SerialNumber, serial)); claim.SerialNumber = serial; }
            if (Pick(changed.Description, claim.Description) is { } description) { changes.Add(("description", claim.Description, description)); claim.Description = description; }

            var produced = changed.ProducedQuantity ?? claim.ProducedQuantity;
            var defective = changed.DefectiveQuantity ?? claim.DefectiveQuantity;
            if ((changed.ProducedQuantity.HasValue || changed.DefectiveQuantity.HasValue) && produced.HasValue && defective.HasValue && defective > produced)
                throw new FluentValidation.ValidationException(new[] { new FluentValidation.Results.ValidationFailure("DefectiveQuantity", "La quantité défectueuse ne peut pas dépasser la quantité produite.") });
            if (changed.ProducedQuantity.HasValue && changed.ProducedQuantity != claim.ProducedQuantity)
            {
                changes.Add(("produced", claim.ProducedQuantity?.ToString(), changed.ProducedQuantity.ToString())); claim.ProducedQuantity = changed.ProducedQuantity; estimateInputsChanged = true;
            }
            if (changed.DefectiveQuantity.HasValue && changed.DefectiveQuantity != claim.DefectiveQuantity)
            {
                changes.Add(("defective", claim.DefectiveQuantity?.ToString(), changed.DefectiveQuantity.ToString())); claim.DefectiveQuantity = changed.DefectiveQuantity; estimateInputsChanged = true;
            }
        }

        // the estimate follows the corrected description of the problem, so the suggested date does too
        // (a claim declared before the estimate existed gets its estimate now, so the creator still has a date to confirm)
        if (estimateInputsChanged || claim.EstimatedDaysP80 == null)
        {
            var estimate = await _estimator.EstimateAsync(
                claim.DefectType, claim.Severity, ct,
                new ClaimEstimateContext(
                    ClientId: claim.ClientId,
                    ProductionLine: claim.ProductionLine,
                    IsInternal: claim.IsInternal,
                    ProducedQuantity: claim.ProducedQuantity,
                    DefectiveQuantity: claim.DefectiveQuantity,
                    AssigneeId: claim.AssignedToId,
                    Month: claim.CreatedAt.Month));
            claim.EstimatedDaysP50 = estimate?.DaysP50;
            claim.EstimatedDaysP80 = estimate?.DaysP80;
            claim.EstimateMethod = estimate?.Method;
            claim.EstimateSampleSize = estimate?.SampleSize;
            claim.EstimatedAt = estimate != null ? now : null;
        }

        var suggested = ClaimCreationSheetRules.SuggestedDeadline(claim.CreatedAt, claim.EstimatedDaysP80);
        var previousDeadline = claim.Deadline;
        DateTime? newDeadline = null;
        string? deadlineEvent = null;
        string? deadlineDetail = null;

        if (request.Deadline.HasValue)
        {
            var chosen = DateTime.SpecifyKind(request.Deadline.Value.Date, DateTimeKind.Utc);
            if (chosen < now.Date) return new("newDateInPast");
            if (chosen > now.Date.AddDays(DeadlineExtensionRules.MaxDaysAhead)) return new("tooFar");
            if (!previousDeadline.HasValue || previousDeadline.Value.Date != chosen)
            {
                // the reason is optional for the creator: a date of their own is traced with their name, the old and the new date, and the reason when they give one
                var reason = (request.DeadlineReason ?? string.Empty).Trim();
                if (reason.Length > DeadlineExtensionRules.MaxReasonLength) return new("reasonTooLong");
                var isSuggestion = suggested.HasValue && suggested.Value.Date == chosen;
                newDeadline = chosen;
                deadlineEvent = isSuggestion ? "claim_deadline_set" : "claim_deadline_changed";
                var oldText = previousDeadline.HasValue ? previousDeadline.Value.ToString("yyyy-MM-dd") : "—";
                deadlineDetail = isSuggestion
                    ? $"{claim.Title} · {oldText} → {chosen:yyyy-MM-dd} · estimation du modèle"
                    : $"{claim.Title} · {oldText} → {chosen:yyyy-MM-dd}" + (reason.Length > 0 ? $" · {reason}" : string.Empty);
            }
        }
        else if (!previousDeadline.HasValue && suggested.HasValue)
        {
            newDeadline = suggested.Value;
            deadlineEvent = "claim_deadline_set";
            deadlineDetail = $"{claim.Title} · — → {suggested.Value:yyyy-MM-dd} · estimation du modèle";
        }

        if (newDeadline.HasValue) claim.Deadline = newDeadline;
        claim.UpdatedAt = now;
        claim.UpdatedById = request.ActorId;

        // everything is written in one save: the corrections, the date, and the confirmation that closes the sheet
        if (changes.Count > 0)
            _context.ClaimEvents.Add(new ClaimEvent { ClaimId = claim.Id, ActionType = ClaimCreationSheetRules.EditedEvent, ActorId = request.ActorId, Detail = ClaimCreationSheetRules.Describe(changes), CreatedAt = now });
        if (deadlineEvent != null)
            _context.ClaimEvents.Add(new ClaimEvent { ClaimId = claim.Id, ActionType = deadlineEvent, ActorId = request.ActorId, Detail = deadlineDetail, CreatedAt = now });
        _context.ClaimEvents.Add(new ClaimEvent { ClaimId = claim.Id, ActionType = ClaimCreationSheetRules.ValidatedEvent, ActorId = request.ActorId, Detail = claim.Title, CreatedAt = now.AddMilliseconds(1) });

        await _context.SaveChangesAsync(ct);
        return new(null, claim.Deadline);
    }
}
