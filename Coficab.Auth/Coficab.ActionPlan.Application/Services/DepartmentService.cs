// Services/DepartmentService.cs
using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Department;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text;

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

    /// <summary>"Qualité", "qualite " and "QUALITE" are the same department name.</summary>
    internal static string NameKey(string name)
    {
        var decomposed = (name ?? string.Empty).Normalize(NormalizationForm.FormD);
        var plain = new StringBuilder();
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) plain.Append(c);
        return string.Join(' ', plain.ToString().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    /// <summary>Inside one organization a department name (ignoring case, accents and spacing) and a code are used once.</summary>
    private async Task EnsureUniqueAsync(Guid organizationId, Guid? selfId, string name, string code)
    {
        var key = NameKey(name);
        var codeKey = (code ?? string.Empty).Trim();
        foreach (var d in await _repo.GetByOrganizationAsync(organizationId))
        {
            if (d.Id == selfId) continue;
            if (NameKey(d.Name) == key) throw new DepartmentRuleException("department_name_taken");
            if (string.Equals(d.Code.Trim(), codeKey, StringComparison.OrdinalIgnoreCase)) throw new DepartmentRuleException("department_code_taken");
        }
    }

    /// <summary>A department can only be attached to a site or region of its own organization.</summary>
    private async Task EnsureLocationAsync(Guid organizationId, Guid? siteId, Guid? regionId)
    {
        if (siteId is { } s && !await _db.Sites.AnyAsync(x => x.Id == s && x.OrganizationId == organizationId))
            throw new DepartmentRuleException("site_not_in_organization");
        if (regionId is { } r && !await _db.Regions.AnyAsync(x => x.Id == r && x.OrganizationId == organizationId))
            throw new DepartmentRuleException("region_not_in_organization");
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
        await EnsureUniqueAsync(dto.OrganizationId, null, dto.Name, dto.Code);
        dto.Name = dto.Name.Trim();
        dto.Code = dto.Code.Trim().ToUpperInvariant();
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
        await EnsureUniqueAsync(dept.OrganizationId, id, dto.Name, dto.Code);
        dto.Name = dto.Name.Trim();
        dto.Code = dto.Code.Trim().ToUpperInvariant();
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

/// <summary>A rule of the department form was broken: a site or region of another organization, or a name or code already used.</summary>
public class DepartmentRuleException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
