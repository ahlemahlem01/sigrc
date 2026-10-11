namespace Coficab.ActionPlan.Application.DomainEvents.Events;

public sealed record ClaimCreatedEvent(
    Guid ClaimId,
    string? DefectType,
    string? ProductionLine,
    string? Severity,
    string? CreatedById,
    DateTime OccurredAtUtc) : IDomainEvent;

public sealed record ClaimClosedEvent(
    Guid ClaimId,
    string? DefectType,
    string? ProductionLine,
    string? Severity,
    string? AssignedToId,
    string? CreatedById,
    DateTime? CompletedAt,
    bool? IsOnTime,
    string? ClosedById,
    DateTime OccurredAtUtc) : IDomainEvent;

public sealed record ActionPlanCompletedEvent(
    Guid ActionPlanId,
    Guid? AlertId,
    Guid? ClaimId,
    string Title,
    string? AssignedToId,
    string? OwnerId,
    DateTime? CompletedAt,
    bool? IsOnTime,
    string? ClosedById,
    DateTime OccurredAtUtc) : IDomainEvent;

/// <summary>Volume claims (defect × line) dépasse le seuil statistique (z-score).</summary>
public sealed record VolumeThresholdExceededEvent(
    string DefectType,
    string ProductionLine,
    double ZScore,
    int CurrentCount,
    double BaselineMean,
    string WeekLabel,
    Guid? DepartmentId,
    DateTime OccurredAtUtc) : IDomainEvent;

public sealed record AnomalyAlertCreatedEvent(
    Guid AlertId,
    string DefectType,
    string ProductionLine,
    double ZScore,
    int CurrentCount,
    double BaselineMean,
    Guid? DepartmentId,
    string Status,
    DateTime DetectedAt,
    DateTime OccurredAtUtc) : IDomainEvent;

public sealed record AnomalyAlertResolvedEvent(
    Guid AlertId,
    string DefectType,
    string ProductionLine,
    string Reason,
    DateTime OccurredAtUtc) : IDomainEvent;
