using MediatR;

namespace Coficab.ActionPlan.Application.DomainEvents;

public sealed class MediatRDomainEventPublisher : IDomainEventPublisher
{
    private readonly IPublisher _publisher;

    public MediatRDomainEventPublisher(IPublisher publisher)
    {
        _publisher = publisher;
    }

    public Task PublishAsync(IDomainEvent domainEvent, CancellationToken cancellationToken = default)
        => _publisher.Publish(domainEvent, cancellationToken);
}
