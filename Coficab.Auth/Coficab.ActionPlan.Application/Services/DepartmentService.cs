// Services/DepartmentService.cs
using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Department;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

public class DepartmentService : IDepartmentService
{
    private readonly IDepartmentRepository _repo;
    private readonly IMapper _mapper;
    private readonly IApplicationDbContext _db;

    public DepartmentService(IDepartmentRepository repo, IMapper mapper, IApplicationDbContext db)
    {
        _repo = repo;
        _mapper = mapper;
        _db = db;
    }

    /// <summary>A department can only be attached to a site or region of its own organization.</summary>
    private async Task EnsureLocationAsync(Guid organizationId, Guid? siteId, Guid? regionId)
    {
        if (siteId is { } s && !await _db.Sites.AnyAsync(x => x.Id == s && x.OrganizationId == organizationId))
            throw new DepartmentLocationException("site_not_in_organization");
        if (regionId is { } r && !await _db.Regions.AnyAsync(x => x.Id == r && x.OrganizationId == organizationId))
            throw new DepartmentLocationException("region_not_in_organization");
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
        await EnsureLocationAsync(dto.OrganizationId, dto.SiteId, dto.RegionId);
        var dept = _mapper.Map<Department>(dto);
        dept.CreatedBy = createdBy;
        await _repo.AddAsync(dept);
        return _mapper.Map<DepartmentDto>(dept);
    }

    public async Task<DepartmentDto> UpdateAsync(Guid id, UpdateDepartmentDto dto, string updatedBy)
    {
        var dept = await _repo.GetByIdAsync(id)
            ?? throw new KeyNotFoundException($"Department {id} not found");

        await EnsureLocationAsync(dept.OrganizationId, dto.SiteId, dto.RegionId);
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

/// <summary>The chosen site or region does not belong to the department's organization.</summary>
public class DepartmentLocationException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
