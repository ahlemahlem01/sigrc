// Services/OrganizationService.cs
using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Organization;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;

namespace Coficab.ActionPlan.Application.Services;

public class OrganizationService : IOrganizationService
{
    private readonly IOrganizationRepository _repo;
    private readonly IMapper _mapper;

    public OrganizationService(IOrganizationRepository repo, IMapper mapper)
    {
        _repo = repo;
        _mapper = mapper;
    }

    public async Task<IEnumerable<OrganizationDto>> GetAllAsync()
        => _mapper.Map<IEnumerable<OrganizationDto>>(await _repo.GetAllAsync());

    public async Task<OrganizationDto?> GetByIdAsync(Guid id)
    {
        var org = await _repo.GetByIdAsync(id);
        return org is null ? null : _mapper.Map<OrganizationDto>(org);
    }

    public async Task<OrganizationDto> CreateAsync(CreateOrganizationDto dto, string createdBy)
    {
        var org = _mapper.Map<Organization>(dto);
        org.CreatedBy = createdBy;
        await _repo.AddAsync(org);
        return _mapper.Map<OrganizationDto>(org);
    }

    public async Task<OrganizationDto> UpdateAsync(Guid id, UpdateOrganizationDto dto, string updatedBy)
    {
        var org = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"Organization {id} not found");
        _mapper.Map(dto, org);
        org.UpdatedBy = updatedBy;
        await _repo.UpdateAsync(org);
        return _mapper.Map<OrganizationDto>(org);
    }

    public async Task ArchiveAsync(Guid id, string archivedBy)
        => await _repo.ArchiveAsync(id, archivedBy);
}