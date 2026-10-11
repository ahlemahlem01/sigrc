namespace Coficab.ActionPlan.Application.DomainEvents;

/// <summary>
/// Abstraction de publication — implémentation MediatR aujourd'hui,
/// interchangeable avec un producteur message broker plus tard.
/// </summary>
public interface IDomainEventPublisher
{
    Task PublishAsync(IDomainEvent domainEvent, CancellationToken cancellationToken = default);
}
