using Coficab.ActionPlan.Application.DomainEvents;
using Coficab.ActionPlan.Application.DomainEvents.Events;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

public class CreateClaimCommandHandler : IRequestHandler<CreateClaimCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly IClaimResolutionEstimateService _estimator;
    private readonly ISemanticSearchService _semanticSearch;
    private readonly IDomainEventPublisher _events;

    public CreateClaimCommandHandler(
        IApplicationDbContext context,
        INotificationService notificationService,
        IClaimResolutionEstimateService estimator,
        ISemanticSearchService semanticSearch,
        IDomainEventPublisher events)
    {
        _context = context;
        _notificationService = notificationService;
        _estimator = estimator;
        _semanticSearch = semanticSearch;
        _events = events;
    }

    public async Task<Guid> Handle(CreateClaimCommand request, CancellationToken cancellationToken)
    {
        // Whatever spelling was typed, the claim stores the one kept by the administrator.
        request.DefectType = (await DefectTypeResolver.LoadAsync(_context, cancellationToken)).Resolve(request.DefectType);

        var claimId = Guid.NewGuid();
        var creatorIdString = request.CreatedById != Guid.Empty
            ? request.CreatedById.ToString()
            : "System";

        byte[]? fileData = null;
        string? fileName = null;
        string? contentType = null;
        if (request.Attachment != null && request.Attachment.Length > 0)
        {
            fileName = request.Attachment.FileName;
            contentType = request.Attachment.ContentType;
            using var memoryStream = new MemoryStream();
            await request.Attachment.CopyToAsync(memoryStream, cancellationToken);
            fileData = memoryStream.ToArray();
        }

        // Par défaut : le créateur est aussi l'assigné (sinon le dossier reste « orphelin »).
        var assignedToId = string.IsNullOrWhiteSpace(request.AssignedToId)
            ? (creatorIdString == "System" ? null : creatorIdString)
            : request.AssignedToId.Trim();
        var assignedToName = string.IsNullOrWhiteSpace(request.AssignedToName)
            ? null
            : request.AssignedToName.Trim();

        if (assignedToId != null && assignedToName == null)
        {
            assignedToName = await ResolveAssigneeNameAsync(assignedToId, cancellationToken);
        }

        // Never trust a client StatusCode of ASSIGNED without a real assignee.
        var initialStatus = !string.IsNullOrWhiteSpace(request.StatusCode)
            ? request.StatusCode!
            : "OUVERTE";

        if (assignedToId != null)
        {
            initialStatus = "ASSIGNED";
        }
        else if (string.Equals(initialStatus, "ASSIGNED", StringComparison.OrdinalIgnoreCase))
        {
            initialStatus = "OUVERTE";
        }

        var estimate = await _estimator.EstimateAsync(
            request.DefectType,
            request.Severity.ToString(),
            cancellationToken);

        var claim = new Claim
        {
            Id = claimId,
            Title = request.Title,
            ClientId = request.ClientId,
            DefectType = request.DefectType,
            Severity = request.Severity.ToString(),
            LotNumber = request.LotNumber,
            SerialNumber = request.SerialNumber,
            DetectionDate = request.DetectionDate,
            Description = request.Description,
            StatusCode = initialStatus,
            CreatedById = creatorIdString,
            CreatedBy = creatorIdString,
            CreatedAt = DateTime.UtcNow,
            AttachmentName = fileName,
            AttachmentContentType = contentType,
            AttachmentData = fileData,
            ProducedQuantity = request.ProducedQuantity,
            DefectiveQuantity = request.DefectiveQuantity,
            AssignedToId = assignedToId,
            AssignedToName = assignedToName,
            AssignedAt = assignedToId != null ? DateTime.UtcNow : null,
            // Estimation only — Deadline stays null unless set explicitly later.
            EstimatedDaysP50 = estimate?.DaysP50,
            EstimatedDaysP80 = estimate?.DaysP80,
            EstimateMethod = estimate?.Method,
            EstimateSampleSize = estimate?.SampleSize,
            EstimatedAt = estimate != null ? DateTime.UtcNow : null,
        };

        var fiveWhy = new FiveWhyAnalysis
        {
            Id = Guid.NewGuid(),
            ClaimId = claimId,
            ProblemStatement = request.Description,
            StatusCode = initialStatus == "ASSIGNED" ? "DRAFT" : initialStatus,
            IsValidated = false,
            CreatedBy = creatorIdString,
            CreatedAt = DateTime.UtcNow
        };

        _context.Claims.Add(claim);
        _context.FiveWhyAnalyses.Add(fiveWhy);
        await _context.SaveChangesAsync(cancellationToken);
        await ClaimAudit.RecordAsync(_context, claim.Id, "claim_created", claim.CreatedById, claim.Title, cancellationToken);

        try { await _semanticSearch.UpsertClaimAsync(claim, cancellationToken); }
        catch { /* embedding is best-effort */ }

        try
        {
            await _events.PublishAsync(new ClaimCreatedEvent(
                claim.Id,
                claim.DefectType,
                claim.ProductionLine,
                claim.Severity,
                claim.CreatedById,
                DateTime.UtcNow), cancellationToken);
        }
        catch { /* domain events are best-effort for create path */ }

        if (assignedToId != null)
        {
            // Pas de notif si on s'assigne soi-même à la création.
            if (!string.Equals(assignedToId, creatorIdString, StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    await _notificationService.NotifyAsync(
                        assignedToId,
                        "claim_assigned",
                        "Réclamation assignée",
                        $"La réclamation « {claim.Title} » vous a été assignée. Vous pouvez démarrer l'analyse (5 Why / Ishikawa / 8D).",
                        actionPlanId: null,
                        linkPath: $"/pages/front/my-claims?claimId={claimId}",
                        claimId: claimId);
                }
                catch
                {
                    // Claim already persisted — do not fail create if notify fails.
                }
            }
        }

        return claimId;
    }

    private async Task<string?> ResolveAssigneeNameAsync(string userId, CancellationToken ct)
    {
        var profile = await _context.UserProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);
        if (profile == null) return null;
        return string.IsNullOrWhiteSpace(profile.Name) ? profile.Email : profile.Name;
    }
}
