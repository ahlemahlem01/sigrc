// Services/DepartmentService.cs
using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Department;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Interfaces;

namespace Coficab.ActionPlan.Application.Services;

public class DepartmentService : IDepartmentService
{
    private readonly IDepartmentRepository _repo;
    private readonly IMapper _mapper;

    public DepartmentService(IDepartmentRepository repo, IMapper mapper)
    {
        _repo = repo;
        _mapper = mapper;
    }

    public async Task<IEnumerable<DepartmentDto>> GetAllAsync()
    {
        var depts = await _repo.GetAllAsync();
        return _mapper.Map<IEnumerable<DepartmentDto>>(depts);
    }

    public async Task<DepartmentDto?> GetByIdAsync(Guid id)
    {
        var dept = await _repo.GetByIdAsync(id);
        return dept is null ? null : _mapper.Map<DepartmentDto>(dept);
    }

    public async Task<DepartmentDto> CreateAsync(CreateDepartmentDto dto, string createdBy)
    {
        var dept = _mapper.Map<Department>(dto);
        dept.CreatedBy = createdBy;
        await _repo.AddAsync(dept);
        return _mapper.Map<DepartmentDto>(dept);
    }

    public async Task<DepartmentDto> UpdateAsync(Guid id, UpdateDepartmentDto dto, string updatedBy)
    {
        var dept = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"Department {id} not found");

        _mapper.Map(dto, dept);
        dept.UpdatedBy = updatedBy;
        await _repo.UpdateAsync(dept);
        return _mapper.Map<DepartmentDto>(dept);
    }

    public async Task ArchiveAsync(Guid id, string archivedBy)
        => await _repo.ArchiveAsync(id, archivedBy);

    public async Task<IEnumerable<DepartmentDto>> GetByOrganizationAsync(Guid organizationId)
    {
        var depts = await _repo.GetByOrganizationAsync(organizationId);
        return _mapper.Map<IEnumerable<DepartmentDto>>(depts);
    }
}