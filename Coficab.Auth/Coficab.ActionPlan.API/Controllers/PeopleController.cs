using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The people directory of the screens: every person with the short code of their department (QA, PROD, LOG...), so that a name is
/// always shown with the department it belongs to. Names are already visible to every signed-in user wherever a plan or a claim is
/// assigned, so this adds nothing sensitive: no e-mail, no phone, no role.
/// </summary>
[ApiController]
[Route("api/people")]
[Authorize]
public class PeopleController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    public PeopleController(IApplicationDbContext db) => _db = db;

    [HttpGet("directory")]
    public async Task<IActionResult> Directory(CancellationToken ct)
    {
        var people = await (from p in _db.UserProfiles.AsNoTracking()
                            join d in _db.Departments.IgnoreQueryFilters().AsNoTracking() on p.DepartmentId equals d.Id
                            where p.UserId != "" && p.Name != ""
                            select new { userId = p.UserId, name = p.Name, departmentCode = d.Code }).ToListAsync(ct);

        // a merged account keeps showing its old id: it points to the person who replaced it
        var aliases = await _db.UserAliases.AsNoTracking().ToListAsync(ct);
        var byId = people.ToDictionary(p => p.userId.ToLowerInvariant(), p => p, StringComparer.OrdinalIgnoreCase);
        var extra = aliases
            .Where(a => !byId.ContainsKey(a.OldUserId.ToLowerInvariant()) && byId.ContainsKey(a.UserId.ToLowerInvariant()))
            .Select(a => new { userId = a.OldUserId, byId[a.UserId.ToLowerInvariant()].name, byId[a.UserId.ToLowerInvariant()].departmentCode });

        return Ok(people.Concat(extra));
    }
}
