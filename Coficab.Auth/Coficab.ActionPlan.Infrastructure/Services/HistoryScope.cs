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
        // A sub-query, not a list of ids sent back to the database: with thousands of claims in archived batches the NOT IN (...) of
        // a parameter took longer than the command timeout (the Pareto box of the claim form never answered).
        var archivedBatches = context.ImportBatches.AsNoTracking().Where(b => b.IsArchived).Select(b => b.Id);
        query = query.Where(c => !context.ImportBatchClaims.Any(bc => bc.ClaimId == c.Id && archivedBatches.Contains(bc.BatchId)));
        return await Task.FromResult(query);
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
