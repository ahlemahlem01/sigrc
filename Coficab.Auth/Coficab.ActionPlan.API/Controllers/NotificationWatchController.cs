using System.Security.Claims;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The departments a superadmin chooses to follow. A superadmin is not told about the requests for validation of every department:
/// only about the ones chosen here, and about the ones nobody else can decide.
/// </summary>
[ApiController]
[Route("api/notification-watch")]
[Authorize(Roles = "superadmin")]
public class NotificationWatchController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    public NotificationWatchController(IApplicationDbContext db) => _db = db;

    private string? UserId => User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    public record WatchRequest(List<Guid>? DepartmentIds);

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var me = UserId;
        if (string.IsNullOrEmpty(me)) return Unauthorized();
        var watched = await _db.SuperadminDepartmentWatches.AsNoTracking().Where(w => w.UserId == me).Select(w => w.DepartmentId).ToListAsync(ct);
        var set = new HashSet<Guid>(watched);
        var departments = await _db.Departments.AsNoTracking().OrderBy(d => d.Name)
            .Select(d => new { d.Id, d.Name, d.Code }).ToListAsync(ct);
        return Ok(departments.Select(d => new { d.Id, d.Name, d.Code, watching = set.Contains(d.Id) }));
    }

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] WatchRequest body, CancellationToken ct)
    {
        var me = UserId;
        if (string.IsNullOrEmpty(me)) return Unauthorized();
        var wanted = (body.DepartmentIds ?? []).Distinct().ToList();
        var known = await _db.Departments.AsNoTracking().Where(d => wanted.Contains(d.Id)).Select(d => d.Id).ToListAsync(ct);

        var current = await _db.SuperadminDepartmentWatches.Where(w => w.UserId == me).ToListAsync(ct);
        _db.SuperadminDepartmentWatches.RemoveRange(current.Where(w => !known.Contains(w.DepartmentId)));
        var have = new HashSet<Guid>(current.Select(w => w.DepartmentId));
        foreach (var id in known.Where(k => !have.Contains(k)))
            _db.SuperadminDepartmentWatches.Add(new SuperadminDepartmentWatch { UserId = me, DepartmentId = id });
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
