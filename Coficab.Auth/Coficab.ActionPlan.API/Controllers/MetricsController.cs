using System.Security.Claims;
using Coficab.ActionPlan.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>Response times per route, to check the "under 300 ms" requirement. Admins only.</summary>
[ApiController]
[Authorize]
[Route("api/metrics")]
public class MetricsController : ControllerBase
{
    private readonly LatencyMetrics _metrics;

    public MetricsController(LatencyMetrics metrics) => _metrics = metrics;

    [HttpGet("latency")]
    public IActionResult Latency()
    {
        var roles = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant());
        if (!roles.Any(r => r is "admin" or "superadmin")) return Forbid();
        return Ok(_metrics.Snapshot());
    }
}
