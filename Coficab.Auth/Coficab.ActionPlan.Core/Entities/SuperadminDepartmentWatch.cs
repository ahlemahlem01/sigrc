namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// A department a superadmin chose to follow: the requests for validation of that department (5 Why, plans, 8D) are sent to them as well.
/// Without any choice a superadmin receives these requests only as a last resort, when nobody else could validate.
/// </summary>
public class SuperadminDepartmentWatch
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string UserId { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
