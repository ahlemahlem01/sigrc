using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// While a customer, a production line or a shift is typed on a claim: the values already used that look the same or close
/// ("Leoni" for "Léoni", "Leoni Wiring" for "Leoni"), so that the same thing is not written two ways. A suggestion only: nothing is changed.
/// </summary>
[ApiController]
[Route("api/value-suggestions")]
[Authorize]
public class ValueSuggestionsController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    public ValueSuggestionsController(IApplicationDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string field, [FromQuery] string? value, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length < 2) return Ok(Array.Empty<object>());
        var claims = _db.Claims.AsNoTracking().Where(c => !c.IsArchived);

        IQueryable<string?> used;
        string listKey;
        switch (field?.Trim().ToLowerInvariant())
        {
            case "client": used = claims.Select(c => (string?)c.ClientId); listKey = ReferenceListKeys.Client; break;
            case "line": used = claims.Select(c => c.ProductionLine); listKey = ReferenceListKeys.ProductionLine; break;
            case "shift": used = claims.Select(c => c.Shift); listKey = ReferenceListKeys.Shift; break;
            default: return BadRequest();
        }

        var fromClaims = await used.Where(v => v != null && v != "").Distinct().Take(5000).ToListAsync(ct);
        var listed = await _db.ReferenceItems.AsNoTracking().Where(r => r.ListKey == listKey).Select(r => r.Value).ToListAsync(ct);
        var found = TextSimilarity.Similar(value, fromClaims.Select(v => v!).Concat(listed));
        return Ok(found.Select(f => new { value = f.Value, score = f.Score, exact = f.Score >= 1.0 }));
    }
}
