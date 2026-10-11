using Coficab.ActionPlan.Core.Common;

namespace Coficab.ActionPlan.Core.Entities;

public class CalendarEvent : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public bool AllDay { get; set; }
    /// <summary>capa | custom | imported</summary>
    public string Source { get; set; } = "custom";
    /// <summary>Libellé libre ou custom (plus de types figés).</summary>
    public string EventType { get; set; } = "custom";
    /// <summary>normal | important | urgent</summary>
    public string Importance { get; set; } = "normal";
    public string? Color { get; set; }
    public Guid? ActionPlanId { get; set; }
    public Guid? ClaimId { get; set; }
    public string ExternalUid { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    /// <summary>true = visible pour tous les employés.</summary>
    public bool IsCompanyWide { get; set; } = true;

    /// <summary>JSON array of Identity user ids (sub).</summary>
    public string? TargetUserIdsJson { get; set; }

    /// <summary>JSON array of department Guids.</summary>
    public string? TargetDepartmentIdsJson { get; set; }
}
