using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>Whether a D4 tool can be used yet, and if not what must be done first (d3, ishikawa, priorityCause).</summary>
public sealed record D4ToolState(bool Open, string? Reason);

public sealed record D4Tools(D4ToolState Ishikawa, D4ToolState Pareto, D4ToolState FiveWhy);

public sealed record D4ChainStatus(
    bool Exempt,
    bool Satisfied,
    bool PriorityCause,
    bool RootInIshikawa,
    bool Overridden,
    string[] Missing,
    D4Tools Tools);

/// <summary>
/// The D4 chain: before the 5 Why can be sent for validation, a priority cause must have been chosen and
/// the Ishikawa must contain a confirmed root cause. The rule never re-opens anything: a dossier whose
/// 5 Why is already submitted/validated, or whose claim is closed, is exempt, and an admin can release a
/// dossier with a recorded reason. Nothing is ever deleted.
/// </summary>
public class D4ChainService
{
    private static readonly string[] ClosedClaimStatuses = { "CLOTUREE", "CLOSED", "VALIDATED", "PENDING_VALIDATION" };

    private readonly ActionPlanDbContext _db;
    private readonly IEightDService _eightD;

    public D4ChainService(ActionPlanDbContext db, IEightDService eightD)
    {
        _db = db;
        _eightD = eightD;
    }

    public async Task<D4ChainStatus> EvaluateAsync(Guid claimId, CancellationToken ct = default)
    {
        var claim = await _db.Claims.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(c => c.Id == claimId, ct);
        var fiveWhy = await _db.FiveWhyAnalyses.AsNoTracking().Include(a => a.Steps).FirstOrDefaultAsync(a => a.ClaimId == claimId, ct);

        var exempt = claim == null
            || ClosedClaimStatuses.Contains(claim.StatusCode, StringComparer.OrdinalIgnoreCase)
            || string.Equals(fiveWhy?.StatusCode, "PENDING_VALIDATION", StringComparison.OrdinalIgnoreCase)
            || string.Equals(fiveWhy?.StatusCode, "VALIDATED", StringComparison.OrdinalIgnoreCase)
            || (fiveWhy?.IsValidated ?? false);

        var priority = await _db.PriorityCauses.AsNoTracking().AnyAsync(p => p.ClaimId == claimId && p.IsCurrent, ct);
        var root = await _db.IshikawaCauses.AsNoTracking().AnyAsync(c => c.ClaimId == claimId && c.IsRootCause, ct);
        var overridden = await _db.D4Overrides.AsNoTracking().AnyAsync(o => o.ClaimId == claimId, ct);

        var missing = new List<string>();
        if (!priority) missing.Add("priorityCause");
        if (!root) missing.Add("rootInIshikawa");

        // ── Order of the D4 tools: D3 done → Ishikawa → Pareto (priority cause) → 5 Why ──
        // Dossiers that are closed, released by an admin, or already past a step (causes listed, 5 Why started)
        // are never locked back: the order only guides work that has not been done yet.
        var ishikawaCount = await _db.IshikawaCauses.AsNoTracking().CountAsync(c => c.ClaimId == claimId, ct);
        var fiveWhyStarted = fiveWhy != null
            && (!string.Equals(fiveWhy.StatusCode, "DRAFT", StringComparison.OrdinalIgnoreCase)
                || !string.IsNullOrWhiteSpace(fiveWhy.RootCauseOccurrence)
                || fiveWhy.Steps.Any(s => !s.IsArchived && !string.IsNullOrWhiteSpace(s.Answer)));
        var d3Done = false;
        try { d3Done = (await _eightD.PeekAsync(claimId, ct))?.Steps.FirstOrDefault(s => s.Step == 4)?.Unlocked ?? false; }
        catch { /* no dossier yet: D3 is not done */ }

        var free = exempt || overridden;
        var ishikawaOpen = free || d3Done || ishikawaCount > 0 || fiveWhyStarted;
        var paretoOpen = ishikawaOpen && (free || ishikawaCount > 0 || fiveWhyStarted);
        var fiveWhyOpen = paretoOpen && (free || priority || fiveWhyStarted);
        var tools = new D4Tools(
            new D4ToolState(ishikawaOpen, ishikawaOpen ? null : "d3"),
            new D4ToolState(paretoOpen, paretoOpen ? null : (ishikawaOpen ? "ishikawa" : "d3")),
            new D4ToolState(fiveWhyOpen, fiveWhyOpen ? null : !ishikawaOpen ? "d3" : ishikawaCount == 0 ? "ishikawa" : "priorityCause"));

        return new D4ChainStatus(exempt, exempt || overridden || missing.Count == 0, priority, root, overridden, missing.ToArray(), tools);
    }
}
