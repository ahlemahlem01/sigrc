using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Several administrators can see the same request for validation: the first to decide wins. The others get a clear answer, who
/// decided and when, instead of a bare refusal.
/// </summary>
public static class DecisionTrace
{
    private static readonly string[] DecisionEvents =
    {
        "fivewhy_validated", "fivewhy_rejected", "fivewhy_returned", "claim_validation_approved", "claim_validation_returned",
    };

    /// <summary>"... was already dealt with by X on DATE.", or the plain fallback when nobody is recorded.</summary>
    public static async Task<string> AlreadyDecidedAsync(IApplicationDbContext db, Guid claimId, string subject, string fallback, string? decidedById = null, DateTime? decidedAt = null, CancellationToken ct = default)
    {
        string? who = decidedById;
        var when = decidedAt;
        if (string.IsNullOrWhiteSpace(who))
        {
            var last = await db.ClaimEvents.AsNoTracking()
                .Where(e => e.ClaimId == claimId && DecisionEvents.Contains(e.ActionType))
                .OrderByDescending(e => e.CreatedAt).FirstOrDefaultAsync(ct);
            who = last?.ActorId;
            when ??= last?.CreatedAt;
        }
        if (string.IsNullOrWhiteSpace(who)) return fallback;

        var name = await db.UserProfiles.AsNoTracking().Where(p => p.UserId == who).Select(p => p.Name).FirstOrDefaultAsync(ct);
        var display = string.IsNullOrWhiteSpace(name) ? who : name;
        var date = when.HasValue ? $" le {when.Value.ToLocalTime():dd/MM/yyyy à HH:mm}" : string.Empty;
        return $"{subject} a déjà été traité par {display}{date}.";
    }
}
