using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Infrastructure.Services;

/// <summary>
/// Which claims count as "history" for statistics and data mining: every claim, archived ones
/// included (archiving never removes history), except the claims of an archived import batch,
/// which an admin withdrew on purpose.
/// </summary>
public static class HistoryScope
{
    public static readonly string[] ClosedStatuses = { "CLOTUREE", "CLOSED", "VALIDATED" };

    public static async Task<IQueryable<Core.Entities.Claim>> ClaimsAsync(IApplicationDbContext context)
    {
        // IgnoreQueryFilters: the global filter hides archived claims, which must stay part of the history.
        IQueryable<Core.Entities.Claim> query = context.Claims.IgnoreQueryFilters();
        var excluded = await ExcludedClaimIdsAsync(context);
        if (excluded.Count > 0)
            query = query.Where(c => !excluded.Contains(c.Id));
        return query;
    }

    public static async Task<List<Guid>> ExcludedClaimIdsAsync(IApplicationDbContext context)
    {
        return await (
            from bc in context.ImportBatchClaims.AsNoTracking()
            join b in context.ImportBatches.AsNoTracking() on bc.BatchId equals b.Id
            where b.IsArchived
            select bc.ClaimId).ToListAsync();
    }
}
