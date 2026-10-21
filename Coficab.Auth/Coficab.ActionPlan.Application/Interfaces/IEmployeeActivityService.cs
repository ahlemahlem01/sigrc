using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface IEmployeeActivityService
{
    Task<EmployeeActivitySummaryDto> RecalculateAllAsync(CancellationToken ct = default);
    Task<EmployeeActivitySummaryDto> GetSummaryAsync(bool forceRecalculate = false, CancellationToken ct = default);
    Task<EmployeeActivitySummaryDto> GetScopedSummaryAsync(string scope, CancellationToken ct = default);
    Task RecalculateUserAsync(string userId, DateTime? lastLoginAt = null, CancellationToken ct = default);
    ActivityStatus ComputeStatus(DateTime? lastActivityUtc, DateTime utcNow);
}
