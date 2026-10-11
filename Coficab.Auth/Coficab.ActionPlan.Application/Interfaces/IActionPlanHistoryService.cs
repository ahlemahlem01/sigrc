using Coficab.ActionPlan.Core.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Coficab.ActionPlan.Application.Interfaces;
public interface IActionPlanHistoryService  // ← AJOUTE public
{
    Task LogAsync(ActionPlanHistory history);
    Task<IEnumerable<ActionPlanHistory>> GetByActionPlanIdAsync(Guid actionPlanId);
}