namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class EightDStepGateDto
{
    public int Step { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public bool Complete { get; set; }
    public bool Unlocked { get; set; }
    public string? Hint { get; set; }
}

public class EightDCapaActionSummaryDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public int Progress { get; set; }
    public string? AssignedToId { get; set; }
    public DateTime? Deadline { get; set; }
    public int ProofCount { get; set; }
    public bool Done { get; set; }
}

public class EightDDossierDto
{
    public Guid Id { get; set; }
    public Guid ClaimId { get; set; }
    public string ClaimTitle { get; set; } = string.Empty;
    public string ClaimStatus { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string DefectType { get; set; } = string.Empty;
    public string LotNumber { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public int CurrentStep { get; set; }
    public string StatusCode { get; set; } = "IN_PROGRESS";

    public string? ChampionId { get; set; }
    public string? ChampionName { get; set; }
    public string? TeamMembers { get; set; }
    public DateTime? TeamFormedAt { get; set; }

    public string? ContainmentDescription { get; set; }
    public string? ContainmentOwner { get; set; }
    public DateTime? ContainmentImplementedAt { get; set; }
    public bool ContainmentVerified { get; set; }
    public string? ContainmentNotes { get; set; }
    public List<EightDContainmentActionDto> ContainmentActions { get; set; } = new();

    public string? EffectivenessMethod { get; set; }
    public int? LotsChecked { get; set; }
    public int? DefectsFound { get; set; }
    public string? EffectivenessNotes { get; set; }
    public bool EffectivenessValidated { get; set; }
    public DateTime? EffectivenessValidatedAt { get; set; }

    public string? PreventiveDescription { get; set; }
    public string? PreventiveScope { get; set; }
    public bool PreventiveStandardized { get; set; }
    public DateTime? PreventiveCompletedAt { get; set; }

    public string? CongratulationsNote { get; set; }
    public string? CustomerName { get; set; }
    public DateTime? ClosedAt { get; set; }
    public string? ClosedById { get; set; }
    public DateTime? CustomerPdfGeneratedAt { get; set; }
    public bool HasCustomerPdf { get; set; }

    public DateTime? SubmittedAt { get; set; }
    public string? SubmittedById { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public string? ValidatedById { get; set; }
    public string? ValidationComment { get; set; }

    public bool FiveWhyComplete { get; set; }
    public bool IshikawaComplete { get; set; }
    public Guid? CapaPlanId { get; set; }
    public string? CapaPlanTitle { get; set; }
    public bool CapaActionsDone { get; set; }
    public bool CapaProofsComplete { get; set; }
    public bool CapaPlanValidated { get; set; }
    public bool CanSubmit { get; set; }
    public bool CanValidate { get; set; }

    public List<EightDStepGateDto> Steps { get; set; } = new();
    public List<EightDCapaActionSummaryDto> CapaActions { get; set; } = new();
    public Dictionary<string, string> FieldOriginals { get; set; } = new();
}

public class SaveEightDDossierDto
{
    public string? ChampionId { get; set; }
    public string? ChampionName { get; set; }
    public string? TeamMembers { get; set; }

    public string? ContainmentDescription { get; set; }
    public string? ContainmentOwner { get; set; }
    public DateTime? ContainmentImplementedAt { get; set; }
    public bool? ContainmentVerified { get; set; }
    public string? ContainmentNotes { get; set; }
    public List<EightDContainmentActionDto>? ContainmentActions { get; set; }

    public string? EffectivenessMethod { get; set; }
    public int? LotsChecked { get; set; }
    public int? DefectsFound { get; set; }
    public string? EffectivenessNotes { get; set; }
    public bool? EffectivenessValidated { get; set; }

    public string? PreventiveDescription { get; set; }
    public string? PreventiveScope { get; set; }
    public bool? PreventiveStandardized { get; set; }

    public string? CongratulationsNote { get; set; }
    public string? CustomerName { get; set; }
}

public class EightDContainmentActionDto
{
    public string Id { get; set; } = string.Empty;
    public string Kind { get; set; } = "OTHER";
    public string Title { get; set; } = string.Empty;
    public string? Owner { get; set; }
    public string? Location { get; set; }
    public int? QtyChecked { get; set; }
    public int? QtyNok { get; set; }
    public string Status { get; set; } = "TODO";
    public string? Notes { get; set; }
    public bool Required { get; set; }
    public string? OriginalOwner { get; set; }
    public string? OriginalLocation { get; set; }
    public string? OriginalStatus { get; set; }
    public string? OriginalNotes { get; set; }
    public int? OriginalQtyChecked { get; set; }
    public int? OriginalQtyNok { get; set; }
}

public class ValidateEightDDossierDto
{
    public bool IsApproved { get; set; }
    public string? Comment { get; set; }
}
