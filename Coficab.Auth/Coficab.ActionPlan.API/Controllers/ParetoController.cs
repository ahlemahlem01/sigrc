using System.Security.Claims;
using Coficab.ActionPlan.Application.DTOs.Pareto;
using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class ParetoController : ControllerBase
{
    private readonly IParetoService _paretoService;

    public ParetoController(IParetoService paretoService)
    {
        _paretoService = paretoService;
    }

    /// <summary>Pareto classique sur une dimension donnée.</summary>
    [HttpPost]
    public async Task<ActionResult<List<ParetoItemDto>>> GetPareto([FromBody] ParetoRequestDto request)
    {
        var result = await _paretoService.GetParetoAsync(request, restrictSmallGroups: !IsAdmin());
        return Ok(result);
    }

    /// <summary>
    /// Mining multi-axes + recommandation automatique de l'axe le plus concentré (suggestion statistique).
    /// </summary>
    [HttpPost("suggest")]
    public async Task<ActionResult<ParetoSuggestionDto>> Suggest([FromBody] ParetoSuggestRequestDto request)
    {
        var result = await _paretoService.GetSuggestionAsync(request, restrictSmallGroups: !IsAdmin());
        return Ok(result);
    }

    /// <summary>Admins see every group; employees only get aggregates (see IParetoService).</summary>
    private bool IsAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant());
        return roles.Any(r => r is "admin" or "superadmin");
    }
}
