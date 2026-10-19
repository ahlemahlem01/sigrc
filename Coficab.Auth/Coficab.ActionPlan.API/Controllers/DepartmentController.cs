
using Coficab.ActionPlan.Core.DTOs.Department;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DepartmentController : ControllerBase
{
    private readonly IDepartmentService _service;

    public DepartmentController(IDepartmentService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? organizationIds = null)
    {
        var depts = await _service.GetAllAsync();
        if (OrganizationFilter.Parse(organizationIds) is { } orgs)
            depts = depts.Where(d => orgs.Contains(d.OrganizationId)).ToList();
        return Ok(depts);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var dept = await _service.GetByIdAsync(id);
        return dept is null ? NotFound() : Ok(dept);
    }

    [HttpGet("by-organization/{organizationId}")]
    public async Task<IActionResult> GetByOrganization(Guid organizationId)
    {
        var depts = await _service.GetByOrganizationAsync(organizationId);
        return Ok(depts);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDepartmentDto dto)
    {
        var createdBy = User.FindFirst("sub")?.Value ?? "system";
        Core.DTOs.Department.DepartmentDto dept;
        try { dept = await _service.CreateAsync(dto, createdBy); }
        catch (Application.Services.DepartmentRuleException e) { return e.Code.EndsWith("_taken") ? Conflict(new { code = e.Code }) : BadRequest(new { code = e.Code }); }
        return CreatedAtAction(nameof(GetById), new { id = dept.Id }, dept);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDepartmentDto dto)
    {
        var updatedBy = User.FindFirst("sub")?.Value ?? "system";
        try { return Ok(await _service.UpdateAsync(id, dto, updatedBy)); }
        catch (Application.Services.DepartmentRuleException e) { return e.Code.EndsWith("_taken") ? Conflict(new { code = e.Code }) : BadRequest(new { code = e.Code }); }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Archive(Guid id)
    {
        var archivedBy = User.FindFirst("sub")?.Value ?? "system";
        await _service.ArchiveAsync(id, archivedBy);
        return NoContent();
    }
}