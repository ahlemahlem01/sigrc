using System.Text.Json.Serialization;

namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class UpdateUserProfileDto
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Role { get; set; }
    [JsonPropertyName("telephone")]
    public string? Phone { get; set; }
    public string? Status { get; set; }
    public string? Poste { get; set; }
    public string? LigneProduction { get; set; }
    public string? Equipe { get; set; }
    public string? ProfilePictureUrl { get; set; }
}
