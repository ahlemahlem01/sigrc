using System.Security.Claims;
using Coficab.ActionPlan.Application.Workflow;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The configurable claim workflow: statuses and the transitions allowed between them, per role.
/// Everyone signed in can read it (screens use it); only a superadmin can change it. Nothing is deleted.
/// </summary>
[ApiController]
[Authorize]
[Route("api/workflow")]
public class WorkflowController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ILogger<WorkflowController> _logger;

    public WorkflowController(IMediator mediator, ILogger<WorkflowController> logger)
    {
        _mediator = mediator;
        _logger = logger;
    }

    public sealed class SaveRequest
    {
        public List<WorkflowStatusInput> Statuses { get; set; } = new();
        public List<WorkflowTransitionInput> Transitions { get; set; } = new();
    }

    [HttpGet("claims")]
    public async Task<IActionResult> Get(CancellationToken ct) => Ok(await _mediator.Send(new GetClaimWorkflowQuery(), ct));

    [HttpPut("claims")]
    public async Task<IActionResult> Save([FromBody] SaveRequest request, CancellationToken ct)
    {
        var isSuper = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
            .Any(c => string.Equals(c.Value?.Trim(), "superadmin", StringComparison.OrdinalIgnoreCase));
        if (!isSuper) return Forbid();

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";
        var saved = await _mediator.Send(
            new SaveClaimWorkflowCommand(request?.Statuses ?? new(), request?.Transitions ?? new(), userId), ct);
        _logger.LogInformation("Claim workflow updated by {UserId}: {Statuses} statuses, {Transitions} transitions submitted",
            userId, request?.Statuses.Count ?? 0, request?.Transitions.Count ?? 0);
        return Ok(saved);
    }
}
