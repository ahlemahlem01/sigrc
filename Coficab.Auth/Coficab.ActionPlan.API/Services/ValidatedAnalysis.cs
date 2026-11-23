using System.Security.Claims;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// Once the administrator validated the root cause (5 Why), the analyses it rests on (Ishikawa, Pareto, priority cause, the 5 Why itself)
/// are final for everyone but the validators. When a validator does change one, it is traced in the claim history and in the version
/// history of the 8D dossier.
/// </summary>
public static class ValidatedAnalysis
{
    public const string Message = "Le 5 Why est validé : seul un administrateur peut modifier cette analyse.";
    public static object Refusal => new { code = "validatedLocked", message = Message };

    public static Task<bool> IsValidatedAsync(IApplicationDbContext db, Guid claimId, CancellationToken ct = default) =>
        db.FiveWhyAnalyses.AsNoTracking().AnyAsync(a => a.ClaimId == claimId && a.StatusCode == "VALIDATED", ct);

    /// <summary>True when the root cause is validated and this user does not hold the validation right.</summary>
    public static async Task<bool> IsLockedForAsync(IApplicationDbContext db, ClaimsPrincipal user, IServiceProvider services, Guid claimId, CancellationToken ct = default) =>
        await IsValidatedAsync(db, claimId, ct)
        && !await PermissionAccess.HasAsync(user, services, PermissionAccess.ValidateFiveWhy, ct);

    /// <summary>Records what a validator changed on an already validated analysis (claim history + 8D version history). Best effort.</summary>
    public static async Task TraceAsync(IApplicationDbContext db, ClaimsPrincipal user, IServiceProvider services, Guid claimId, string what, CancellationToken ct = default)
    {
        try
        {
            var actor = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub") ?? "system";
            var text = $"Après validation de la cause racine : {what}";
            await ClaimAudit.RecordAsync(db, claimId, "validated_analysis_amended", actor, text, ct);
            var eightD = (IEightDService?)services.GetService(typeof(IEightDService));
            if (eightD != null) await eightD.RecordAmendmentAsync(claimId, actor, text.Length > 480 ? text[..480] : text, ct);
        }
        catch
        {
            // the trace must never undo the change itself
        }
    }
}
