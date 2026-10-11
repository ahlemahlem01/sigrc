using Coficab.ActionPlan.Application.DTOs.Pareto;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface IParetoService
{
    /// <param name="restrictSmallGroups">Employees only get aggregates: groups below 3 dossiers are merged or hidden.</param>
    Task<List<ParetoItemDto>> GetParetoAsync(ParetoRequestDto request, bool restrictSmallGroups = false);
    Task<ParetoSuggestionDto> GetSuggestionAsync(ParetoSuggestRequestDto request, bool restrictSmallGroups = false);
}
