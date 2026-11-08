using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Services;

/// <summary>A plan built from a 5 Why is carried out only once the administrator approved it: no progress can be reported before.</summary>
public static class PlanApprovalGate
{
    public const string Message = "Le plan doit d'abord être approuvé par un administrateur avant d'être exécuté.";
    public static object Refusal => new { code = "planNotApproved", error = Message, message = Message };

    public static Task<bool> PlanIsBlockedAsync(IApplicationDbContext db, Guid planId, CancellationToken ct = default) =>
        db.ActionPlans.AsNoTracking().AnyAsync(p => p.Id == planId && p.ApprovalStatus != PlanApprovalStatus.Approved, ct);

    public static async Task<bool> ActionIsBlockedAsync(IApplicationDbContext db, Guid actionId, CancellationToken ct = default)
    {
        var planId = await db.PlanActions.AsNoTracking().Where(a => a.Id == actionId).Select(a => (Guid?)a.ActionPlanId).FirstOrDefaultAsync(ct);
        return planId.HasValue && await PlanIsBlockedAsync(db, planId.Value, ct);
    }
}
