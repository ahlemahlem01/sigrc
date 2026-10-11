using System.Security.Claims;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Calendar;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OpenIddict.Abstractions;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/calendar")]
[Authorize]
public class CalendarEventController : ControllerBase
{
    private readonly ICalendarEventService _service;

    public CalendarEventController(ICalendarEventService service)
    {
        _service = service;
    }

    private string? UserId =>
        User.FindFirstValue(OpenIddictConstants.Claims.Subject)
        ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirst("sub")?.Value;

    private bool IsAdmin
    {
        get
        {
            var role = User.FindFirstValue("role")
                ?? User.FindFirstValue(ClaimTypes.Role)
                ?? string.Empty;
            var roles = role.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            return roles.Any(r =>
            {
                var x = r.ToLowerInvariant();
                return x is "admin" or "superadmin" or "admin_quality";
            });
        }
    }

    private string? DepartmentClaim => User.FindFirstValue("department");

    [HttpGet]
    public async Task<IActionResult> GetRange([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-1);
        var end = to ?? DateTime.UtcNow.AddMonths(2);
        var events = await _service.GetRangeAsync(start, end, UserId, IsAdmin, DepartmentClaim);
        return Ok(new { data = events });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCalendarEventDto dto)
    {
        try
        {
            var created = await _service.CreateAsync(dto, UserId ?? "system");
            return Ok(created);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCalendarEventDto dto)
    {
        try
        {
            var updated = await _service.UpdateAsync(id, dto, UserId ?? "system");
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Événement introuvable." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await _service.DeleteAsync(id, UserId ?? "system");
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Événement introuvable." });
        }
    }

    [HttpGet("export.ics")]
    public async Task<IActionResult> Export([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-1);
        var end = to ?? DateTime.UtcNow.AddMonths(6);
        var ics = await _service.ExportIcsAsync(start, end, UserId, IsAdmin, DepartmentClaim);
        return File(System.Text.Encoding.UTF8.GetBytes(ics), "text/calendar; charset=utf-8", "coficab-calendar.ics");
    }

    [HttpPost("import.ics")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Import([FromBody] ImportIcsRequest body)
    {
        if (string.IsNullOrWhiteSpace(body?.Ics))
            return BadRequest(new { error = "Contenu ICS requis." });
        var imported = await _service.ImportIcsAsync(body.Ics, UserId ?? "system");
        return Ok(new { data = imported, count = imported.Count() });
    }

    public class ImportIcsRequest
    {
        public string Ics { get; set; } = string.Empty;
    }
}
