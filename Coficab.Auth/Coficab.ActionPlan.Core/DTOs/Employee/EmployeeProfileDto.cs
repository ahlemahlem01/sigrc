using System.Text.Json.Serialization;

namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class EmployeeProfileDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string ManagerName { get; set; } = string.Empty;
    public string ManagerEmail { get; set; } = string.Empty;
    public string HireDate { get; set; } = string.Empty;
    public string Status { get; set; } = "active";
    [JsonPropertyName("telephone")]
    public string? Phone { get; set; }
    public string Poste { get; set; } = string.Empty;
    public string? LigneProduction { get; set; }
    public string Equipe { get; set; } = string.Empty;
}
