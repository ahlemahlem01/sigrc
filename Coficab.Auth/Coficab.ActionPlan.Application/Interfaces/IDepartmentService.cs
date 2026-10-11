
using Coficab.ActionPlan.Core.DTOs.Department;

namespace Coficab.ActionPlan.Application.Interfaces;


public interface IDepartmentService
{
    Task<IEnumerable<DepartmentDto>> GetAllAsync();
    Task<DepartmentDto?> GetByIdAsync(Guid id);
    Task<DepartmentDto> CreateAsync(CreateDepartmentDto dto, string createdBy);
    Task<DepartmentDto> UpdateAsync(Guid id, UpdateDepartmentDto dto, string updatedBy);
    Task ArchiveAsync(Guid id, string archivedBy);
    Task<IEnumerable<DepartmentDto>> GetByOrganizationAsync(Guid organizationId);
}