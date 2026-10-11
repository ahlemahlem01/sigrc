using Microsoft.AspNetCore.Identity;

namespace Coficab.Auth.API.Models;

public class ApplicationUser : IdentityUser
{
    public string FullName { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public Guid? DepartmentId { get; set; }

    // Plain Guid — no FK constraint since organizations live in a separate DB (ActionPlan API 7204)
    public Guid? OrganizationId { get; set; }

    /// <summary>Dernière connexion réussie (UTC).</summary>
    public DateTime? LastLoginAt { get; set; }

    // Navigation
    public ICollection<UserPermission> UserPermissions { get; set; } = [];
}