namespace Coficab.Auth.API.Models;

public class UserPermission
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string PermissionId { get; set; } = string.Empty;
    public bool IsGranted { get; set; } = true;
    public string GrantedById { get; set; } = string.Empty;
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ApplicationUser User { get; set; } = null!;
    public Permission Permission { get; set; } = null!;
    public ApplicationUser GrantedBy { get; set; } = null!;
}