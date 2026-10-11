using Coficab.ActionPlan.Core.DTOs.Organization;
using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrganizationController : ControllerBase
{
    private readonly IOrganizationService _service;

    public OrganizationController(IOrganizationService service)
    {
        _service = service;
    }

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
        var createdBy = User.FindFirst("sub")?.Value ?? "system";
        var org = await _service.CreateAsync(dto, createdBy);
        return CreatedAtAction(nameof(GetById), new { id = org.Id }, org);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateOrganizationDto dto)
    {
        var updatedBy = User.FindFirst("sub")?.Value ?? "system";
        var org = await _service.UpdateAsync(id, dto, updatedBy);
        return Ok(org);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Archive(Guid id)
    {
        var archivedBy = User.FindFirst("sub")?.Value ?? "system";
        await _service.ArchiveAsync(id, archivedBy);
        return NoContent();
    }
}