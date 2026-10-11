using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.Entities;

public class ActionPlanHistory : BaseEntity
{
    public Guid ActionPlanId { get; set; }
    public ActionPlan ActionPlan { get; set; } = null!;

    // Qui a fait l'action
    public string ChangedBy { get; set; } = string.Empty;
    public string? ChangedByName { get; set; }

    // Type d'action (pas un enum, juste une string pour flexibilité)
    public string ActionType { get; set; } = string.Empty;
    // Valeurs: "created", "status_changed", "fields_updated", "assigned", 
    //          "unassigned", "archived", "restored", "deleted"

    // Pour les changements de statut (optionnel)
    public ActionPlanStatus? OldStatus { get; set; }
    public ActionPlanStatus? NewStatus { get; set; }

    // Pour les changements de champs (stocké en JSON)
    public string? ChangesJson { get; set; }
    // Exemple: [{"field":"Titre","old":"Ancien","new":"Nouveau"},{"field":"Date limite","old":"15/06/2026","new":"29/06/2026"}]

    // Pour l'assignation (optionnel)
    public string? OldAssignedToId { get; set; }
    public string? NewAssignedToId { get; set; }
    public string? OldAssignedToName { get; set; }
    public string? NewAssignedToName { get; set; }

    // Note libre (optionnel)
    public string? Note { get; set; }
}