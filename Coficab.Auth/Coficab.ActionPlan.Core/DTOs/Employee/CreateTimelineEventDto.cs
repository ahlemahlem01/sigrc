using System.Text.Json.Serialization;

namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class CreateTimelineEventDto
{
    [JsonPropertyName("userId")]
    public string UserId { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("planTitle")]
    public string? PlanTitle { get; set; }

    [JsonPropertyName("planId")]
    public Guid? PlanId { get; set; }

    [JsonPropertyName("badgeId")]
    public Guid? BadgeId { get; set; }

    [JsonPropertyName("actorName")]
    public string? ActorName { get; set; }
}