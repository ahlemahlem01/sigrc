// Interfaces/IOrganizationService.cs
using Coficab.ActionPlan.Core.DTOs.Organization;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface IOrganizationService
{
    Task<IEnumerable<OrganizationDto>> GetAllAsync();
    Task<OrganizationDto?> GetByIdAsync(Guid id);
    Task<OrganizationDto> CreateAsync(CreateOrganizationDto dto, string createdBy);
    Task<OrganizationDto> UpdateAsync(Guid id, UpdateOrganizationDto dto, string updatedBy);
    Task ArchiveAsync(Guid id, string archivedBy);
}