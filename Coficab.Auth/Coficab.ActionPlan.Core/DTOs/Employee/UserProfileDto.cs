using System.Text.Json.Serialization;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class UserProfileDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string ManagerName { get; set; } = string.Empty;
    public string ManagerEmail { get; set; } = string.Empty;
    public string HireDate { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    [JsonPropertyName("telephone")]
    public string? Phone { get; set; }
    public string Poste { get; set; } = string.Empty;
    public string? LigneProduction { get; set; }
    public string Equipe { get; set; } = string.Empty;
    public string? ProfilePictureUrl { get; set; }
    public string? CreatedAt { get; set; }

    public ActivityStatus ActivityStatus { get; set; } = ActivityStatus.Inactive;
    public DateTime? LastActivityAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime? ActivityStatusComputedAt { get; set; }
}
