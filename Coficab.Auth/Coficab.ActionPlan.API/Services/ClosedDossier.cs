using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Common;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>
/// A closed claim (its 8D validated and closed) is read-only: the analysis tools (containment, Ishikawa, priority cause,
/// 5 Why) and the customer PDF are kept exactly as they were when it was closed.
/// </summary>
public static class ClosedDossier
{
    public const string Message = "Dossier clôturé : consultation seule.";

    public static async Task<bool> IsClosedAsync(IApplicationDbContext db, Guid claimId, CancellationToken ct = default)
    {
        var status = await db.Claims.AsNoTracking().Where(c => c.Id == claimId).Select(c => c.StatusCode).FirstOrDefaultAsync(ct);
        return CompletionTracking.IsClosedClaimStatus(status);
    }

    public static object Refusal => new { message = Message, reason = "closed" };
}
