using Coficab.ActionPlan.Application.Organizations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>Regions, countries and sites of an organization. Reading is open to any signed-in user; changes are for administrators.</summary>
[ApiController]
[Route("api/organization/{organizationId:guid}/structure")]
[Authorize]
public class OrganizationStructureController : ControllerBase
{
    private readonly OrganizationStructureService _service;

    public OrganizationStructureController(OrganizationStructureService service) => _service = service;

    private string Me => User.FindFirst("sub")?.Value ?? "system";

    private IActionResult Refuse(StructureException ex) =>
        ex.NotFound
            ? NotFound(new { code = ex.Code })
            : ex.Code is "node_in_use" or "too_many_sites"
                ? Conflict(new { code = ex.Code, count = ex.Count })
                : BadRequest(new { code = ex.Code });

    [HttpGet]
    public async Task<IActionResult> Get(Guid organizationId, CancellationToken ct)
    {
        try { return Ok(await _service.GetAsync(organizationId, ct)); }
        catch (StructureException ex) { return Refuse(ex); }
    }

    [HttpPost("{level}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Create(Guid organizationId, string level, [FromBody] StructureInput input, CancellationToken ct)
    {
        try { return Ok(await _service.CreateAsync(organizationId, level, input, Me, ct)); }
        catch (StructureException ex) { return Refuse(ex); }
    }

    [HttpPut("{level}/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Update(Guid organizationId, string level, Guid id, [FromBody] StructureInput input, CancellationToken ct)
    {
        try { return Ok(await _service.UpdateAsync(organizationId, level, id, input, Me, ct)); }
        catch (StructureException ex) { return Refuse(ex); }
    }

    /// <summary>Archives the node; it is refused while departments, sites or countries still depend on it.</summary>
    [HttpDelete("{level}/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Archive(Guid organizationId, string level, Guid id, CancellationToken ct)
    {
        try { await _service.ArchiveAsync(organizationId, level, id, Me, ct); return NoContent(); }
        catch (StructureException ex) { return Refuse(ex); }
    }
}
