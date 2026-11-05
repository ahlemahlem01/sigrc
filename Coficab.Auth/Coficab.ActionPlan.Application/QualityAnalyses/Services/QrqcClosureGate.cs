using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// An internal (workshop) problem is closed only when it holds a root cause and a corrective action; the administrator's
/// validation of the 8D dossier stays the last step. Containment alone (cleaning, a warning to the operator) does not close it.
/// Customer claims are not concerned: their way of closing is unchanged.
/// </summary>
public static class QrqcClosureGate
{
    public const string RootCause = "la cause racine (5 Pourquoi)";
    public const string CorrectiveAction = "une action corrective (plan d'actions correctives avec au moins une action)";

    /// <summary>What is still missing before the claim can be closed (empty: it can be).</summary>
    public static async Task<IReadOnlyList<string>> MissingAsync(IApplicationDbContext db, Claim claim, CancellationToken ct = default)
    {
        var missing = new List<string>();
        if (!claim.IsInternal) return missing;

        var hasRootCause = await db.FiveWhyAnalyses.AsNoTracking().AnyAsync(a => a.ClaimId == claim.Id && !a.IsArchived
            && ((a.RootCause != null && a.RootCause.Trim() != "")
                || (a.RootCauseOccurrence != null && a.RootCauseOccurrence.Trim() != "")), ct);
        if (!hasRootCause) missing.Add(RootCause);

        var hasCorrective = await db.ActionPlans.AsNoTracking().AnyAsync(p => p.ClaimId == claim.Id && p.Type == ActionPlanType.PAC
            && db.PlanActions.Any(a => a.ActionPlanId == p.Id), ct);
        if (!hasCorrective) missing.Add(CorrectiveAction);

        return missing;
    }

    public static string Message(IReadOnlyList<string> missing) =>
        "Ce problème interne ne peut pas être clôturé : il manque " + string.Join(" et ", missing) + ".";
}
