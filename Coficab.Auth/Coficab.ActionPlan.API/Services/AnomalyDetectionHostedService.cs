namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Ancien job quotidien de détection d'anomalies — remplacé par MediatR
/// (ClaimCreated / ClaimClosed → RecalculateAnomalyOnClaimChangeHandler).
/// Ne pas enregistrer comme HostedService.
/// </summary>
[Obsolete("Event-driven anomaly detection via MediatR domain events.")]
public static class AnomalyDetectionHostedServiceMarker
{
}
