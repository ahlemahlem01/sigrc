using System.Security.Claims;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The cause an analyst decided to dig into (between Ishikawa/Pareto and the 5 Why).
/// Append-only: choosing another cause supersedes the previous one, which stays in the history.
/// Nothing is ever deleted, and the choice stays modifiable on any dossier: every previous value is kept and shown.
/// A manual choice is always allowed; suggestions are only shortcuts.
/// </summary>
[ApiController]
[Authorize]
[Route("api/priority-cause")]
public class PriorityCauseController : ControllerBase
{
    private static readonly string[] Sources = { "manual", "pareto", "mining", "ishikawa" };

    private readonly ActionPlanDbContext _db;

    public PriorityCauseController(ActionPlanDbContext db) => _db = db;

    public sealed class SelectionRow
    {
        public Guid Id { get; set; }
        public Guid ClaimId { get; set; }
        public string? Category { get; set; }
        public string CauseText { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public string SelectedById { get; set; } = string.Empty;
        public string? SelectedByName { get; set; }
        public DateTime SelectedAt { get; set; }
        public bool IsCurrent { get; set; }
        public DateTime? SupersededAt { get; set; }
    }

    public sealed class SelectRequest
    {
        public string? Category { get; set; }
        public string? Text { get; set; }
        public string? Source { get; set; }
    }

    [HttpGet("{claimId:guid}")]
    public async Task<IActionResult> Get(Guid claimId, CancellationToken ct)
    {
        var (claim, error) = await AuthorizeAsync(claimId, ct);
        if (error != null) return error;

        var rows = await ReadAsync(claimId, ct);
        return Ok(new { current = rows.FirstOrDefault(r => r.IsCurrent), history = rows });
    }

    [HttpPost("{claimId:guid}")]
    public async Task<IActionResult> Select(Guid claimId, [FromBody] SelectRequest request, CancellationToken ct)
    {
        var (claim, error) = await AuthorizeAsync(claimId, ct);
        if (error != null) return error;
        if (await Services.ClosedDossier.IsClosedAsync(_db, claimId, ct))
            return Conflict(Services.ClosedDossier.Refusal);

        var text = (request.Text ?? string.Empty).Trim();
        if (text.Length == 0 || text.Length > 500)
            return BadRequest(new { message = "La cause est obligatoire (500 caractères maximum)." });

        string? category = null;
        if (!string.IsNullOrWhiteSpace(request.Category))
        {
            if (!Enum.TryParse<IshikawaCategory>(request.Category, true, out var parsed))
                return BadRequest(new { message = "Catégorie 6M inconnue." });
            category = parsed.ToString();
        }

        var source = (request.Source ?? "manual").Trim().ToLowerInvariant();
        if (!Sources.Contains(source)) source = "manual";

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";
        var userName = User.FindFirst("name")?.Value ?? User.Identity?.Name;
        var now = DateTime.UtcNow;
        var id = Guid.NewGuid();

        // Previous choice is superseded, never removed. Two saves so the "one current per claim" index is never violated.
        await using var tx = await BeginAsync(ct);
        var previous = await _db.PriorityCauses.Where(p => p.ClaimId == claimId && p.IsCurrent).ToListAsync(ct);
        foreach (var p in previous)
        {
            p.IsCurrent = false;
            p.SupersededAt = now;
        }
        await _db.SaveChangesAsync(ct);
        _db.PriorityCauses.Add(new PriorityCause
        {
            Id = id, ClaimId = claimId, Category = category, CauseText = text, Source = source,
            SelectedById = userId, SelectedByName = userName, SelectedAt = now, IsCurrent = true,
        });
        await _db.SaveChangesAsync(ct);
        if (tx != null) await tx.CommitAsync(ct);

        var rows = await ReadAsync(claimId, ct);
        return Ok(new { current = rows.FirstOrDefault(r => r.IsCurrent), history = rows });
    }

    /// <summary>Transactions only exist on a relational database (the in-memory test database has none).</summary>
    private async Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction?> BeginAsync(CancellationToken ct) =>
        _db.Database.IsRelational() ? await _db.Database.BeginTransactionAsync(ct) : null;

    private Task<List<SelectionRow>> ReadAsync(Guid claimId, CancellationToken ct) =>
        _db.PriorityCauses.AsNoTracking()
            .Where(p => p.ClaimId == claimId)
            .OrderByDescending(p => p.SelectedAt)
            .Select(p => new SelectionRow
            {
                Id = p.Id, ClaimId = p.ClaimId, Category = p.Category, CauseText = p.CauseText, Source = p.Source,
                SelectedById = p.SelectedById, SelectedByName = p.SelectedByName, SelectedAt = p.SelectedAt,
                IsCurrent = p.IsCurrent, SupersededAt = p.SupersededAt,
            })
            .ToListAsync(ct);

    /// <summary>Admins, or the person who created / is assigned to the claim.</summary>
    private async Task<(Core.Entities.Claim? claim, IActionResult? error)> AuthorizeAsync(Guid claimId, CancellationToken ct)
    {
        var claim = await _db.Claims.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(c => c.Id == claimId, ct);
        if (claim == null) return (null, NotFound(new { message = "Réclamation introuvable." }));

        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant());
        if (roles.Any(r => r is "admin" or "superadmin")) return (claim, null);

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var mine = string.Equals(claim.CreatedById, userId, StringComparison.OrdinalIgnoreCase)
                   || string.Equals(claim.AssignedToId, userId, StringComparison.OrdinalIgnoreCase);
        return mine ? (claim, null) : (null, Forbid());
    }
}
