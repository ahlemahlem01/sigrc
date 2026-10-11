using MediatR;

namespace Coficab.ActionPlan.Application.DomainEvents;

/// <summary>
/// Marqueur pour les événements métier. Aujourd'hui : MediatR in-process.
/// Demain : sérialisation vers un broker (RabbitMQ, Azure Service Bus, etc.).
/// </summary>
public interface IDomainEvent : INotification
{
    DateTime OccurredAtUtc { get; }
}
