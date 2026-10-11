// Application/Services/ActionPlanHistoryService.cs
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Interfaces;

namespace Coficab.ActionPlan.Application.Services;

public class ActionPlanHistoryService : IActionPlanHistoryService
{
    private readonly IGenericRepository<ActionPlanHistory> _repo;

    public ActionPlanHistoryService(IGenericRepository<ActionPlanHistory> repo)
    {
        _repo = repo;
    }

    public async Task LogAsync(ActionPlanHistory history)
    {
        await _repo.AddAsync(history);
    }

    public async Task<IEnumerable<ActionPlanHistory>> GetByActionPlanIdAsync(Guid actionPlanId)
    {
        var all = await _repo.GetAllAsync();
        return all.Where(h => h.ActionPlanId == actionPlanId).OrderByDescending(h => h.CreatedAt);
    }
}