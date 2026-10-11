using System.Security.Claims;
using Coficab.ActionPlan.Application.ReferenceLists;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// Multi-industry vocabulary: the defect types and the wording of the severity levels.
/// Readable by everyone signed in (forms use it as suggestions); editable by admins. Nothing is deleted.
/// </summary>
[ApiController]
[Authorize]
[Route("api/reference-lists")]
public class ReferenceListsController : ControllerBase
{
    private readonly IMediator _mediator;

    public ReferenceListsController(IMediator mediator) => _mediator = mediator;

    public sealed class SaveRequest
    {
        public List<ReferenceItemDto> Items { get; set; } = new();
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct) => Ok(await _mediator.Send(new GetReferenceListsQuery(), ct));

    [HttpPut("{listKey}")]
    public async Task<IActionResult> Save(string listKey, [FromBody] SaveRequest request, CancellationToken ct)
    {
        if (!IsAdmin()) return Forbid();
        return Ok(await _mediator.Send(new SaveReferenceListCommand(listKey, request?.Items ?? new(), UserId()), ct));
    }

    [HttpPost("defect-type/import-existing")]
    public async Task<IActionResult> ImportExisting(CancellationToken ct)
    {
        if (!IsAdmin()) return Forbid();
        return Ok(await _mediator.Send(new ImportExistingDefectTypesCommand(UserId()), ct));
    }

    public sealed class MergeRequest
    {
        public string Canonical { get; set; } = string.Empty;
        public List<string> Variants { get; set; } = new();
    }

    public sealed class UnmergeRequest
    {
        public string Value { get; set; } = string.Empty;
    }

    [HttpGet("defect-type/duplicates")]
    public async Task<IActionResult> Duplicates(CancellationToken ct)
    {
        if (!IsAdmin()) return Forbid();
        return Ok(await _mediator.Send(new GetDefectTypeDuplicatesQuery(), ct));
    }

    [HttpPost("defect-type/merge")]
    public async Task<IActionResult> Merge([FromBody] MergeRequest request, CancellationToken ct)
    {
        if (!IsAdmin()) return Forbid();
        return Ok(await _mediator.Send(new MergeDefectTypesCommand(request?.Canonical ?? string.Empty, request?.Variants ?? new(), UserId()), ct));
    }

    [HttpPost("defect-type/unmerge")]
    public async Task<IActionResult> Unmerge([FromBody] UnmergeRequest request, CancellationToken ct)
    {
        if (!IsAdmin()) return Forbid();
        return Ok(await _mediator.Send(new UnmergeDefectTypeCommand(request?.Value ?? string.Empty, UserId()), ct));
    }

    private string UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";

    private bool IsAdmin() => User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role))
        .Any(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant() is "admin" or "superadmin");
}
