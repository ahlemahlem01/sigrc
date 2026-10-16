namespace Coficab.ActionPlan.Core.DTOs.Employee;

public class MoveDepartmentDto
{
    public Guid DepartmentId { get; set; }
}

public enum DepartmentMoveResult
{
    Moved,
    ProfileNotFound,
    DepartmentNotFound,
}
