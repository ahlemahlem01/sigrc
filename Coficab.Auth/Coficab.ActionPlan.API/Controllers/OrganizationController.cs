using Coficab.ActionPlan.Core.DTOs.Organization;
using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Coficab.ActionPlan.Application.Organizations;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrganizationController : ControllerBase
{
    private readonly IOrganizationService _service;
    private readonly OrganizationStructureService _structure;

    public OrganizationController(IOrganizationService service, OrganizationStructureService structure)
    {
        _service = service;
        _structure = structure;
    }

    /// <summary>The organization type (which levels exist between the corporate level and the sites) is set by the superadmin, the supplier.</summary>
    private bool IsSuperAdmin() => User.FindAll("role").Concat(User.FindAll(System.Security.Claims.ClaimTypes.Role))
        .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));

    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await _service.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var org = await _service.GetByIdAsync(id);
        return org is null ? NotFound() : Ok(org);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateOrganizationDto dto)
    {
        if (!IsSuperAdmin()) return Forbid();
        var createdBy = User.FindFirst("sub")?.Value ?? "system";
        var org = await _service.CreateAsync(dto, createdBy);
        return CreatedAtAction(nameof(GetById), new { id = org.Id }, org);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateOrganizationDto dto, CancellationToken ct)
    {
        var current = await _service.GetByIdAsync(id);
        if (current is null) return NotFound();
        if (current.Type != dto.Type)
        {
            if (!IsSuperAdmin()) return Forbid();
            var conflicts = await _structure.ConflictsForTypeAsync(id, dto.Type, ct);
            if (conflicts.Count > 0)
                return Conflict(new { code = "type_conflict", conflicts = conflicts.Select(c => new { code = c.Code, count = c.Count }) });
        }
        var updatedBy = User.FindFirst("sub")?.Value ?? "system";
        var org = await _service.UpdateAsync(id, dto, updatedBy);
        return Ok(org);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Archive(Guid id)
    {
        if (!IsSuperAdmin()) return Forbid();
        var archivedBy = User.FindFirst("sub")?.Value ?? "system";
        await _service.ArchiveAsync(id, archivedBy);
        return NoContent();
    }
}