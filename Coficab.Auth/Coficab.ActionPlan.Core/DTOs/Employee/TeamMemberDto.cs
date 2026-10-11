namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class TeamMemberDto
{
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Initials { get; set; } = string.Empty;
    public string Status { get; set; } = "active"; // active, remote, leave
}