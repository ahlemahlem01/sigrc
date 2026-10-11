using Coficab.ActionPlan.Application.Claims.Commands.StartClaimAnalysis;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;
using FluentValidation;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands;

public class AssignClaimCommandValidator : AbstractValidator<AssignClaimCommand>
{
    public AssignClaimCommandValidator()
    {
        RuleFor(x => x.ClaimId).NotEmpty().WithMessage("La réclamation est obligatoire.");
        RuleFor(x => x.AssignedToId).MaximumLength(100).WithMessage("L'identifiant de l'assigné ne doit pas dépasser 100 caractères.");
        RuleFor(x => x.AssignedToName).MaximumLength(200).WithMessage("Le nom de l'assigné ne doit pas dépasser 200 caractères.");
    }
}

public class SetClaimDeadlineCommandValidator : AbstractValidator<SetClaimDeadlineCommand>
{
    public SetClaimDeadlineCommandValidator()
    {
        RuleFor(x => x.ClaimId).NotEmpty().WithMessage("La réclamation est obligatoire.");
        RuleFor(x => x.Deadline).NotEqual(default(DateTime)).WithMessage("La date limite est obligatoire.");
    }
}

public class StartClaimAnalysisCommandValidator : AbstractValidator<StartClaimAnalysisCommand>
{
    public StartClaimAnalysisCommandValidator()
    {
        RuleFor(x => x.ClaimId).NotEmpty().WithMessage("La réclamation est obligatoire.");
        RuleFor(x => x.ProductionLine).MaximumLength(100).WithMessage("La ligne de production ne doit pas dépasser 100 caractères.");
        RuleFor(x => x.Shift).MaximumLength(50).WithMessage("L'équipe ne doit pas dépasser 50 caractères.");
        RuleFor(x => x.AnalysisNotes).MaximumLength(2000).WithMessage("Les notes d'analyse ne doivent pas dépasser 2000 caractères.");
    }
}

public class CreateIshikawaCauseCommandValidator : AbstractValidator<CreateIshikawaCauseCommand>
{
    public CreateIshikawaCauseCommandValidator()
    {
        RuleFor(x => x.ClaimId).NotEmpty().WithMessage("La réclamation associée est obligatoire.");
        RuleFor(x => x.Category).IsInEnum().WithMessage("La catégorie Ishikawa doit faire partie des 6M.");
        RuleFor(x => x.CauseDescription)
            .NotEmpty().WithMessage("La description de la cause est obligatoire.")
            .MaximumLength(500).WithMessage("La description de la cause ne doit pas dépasser 500 caractères.");
        RuleFor(x => x.CreatedBy).NotEmpty().WithMessage("L'auteur de la cause est obligatoire.");
    }
}

public class ArchiveIshikawaCauseCommandValidator : AbstractValidator<ArchiveIshikawaCauseCommand>
{
    public ArchiveIshikawaCauseCommandValidator()
    {
        RuleFor(x => x.CauseId).NotEmpty().WithMessage("La cause est obligatoire.");
        RuleFor(x => x.ArchivedBy).NotEmpty().WithMessage("L'auteur de l'archivage est obligatoire.");
        RuleFor(x => x.ArchiveReason).MaximumLength(500).WithMessage("Le motif d'archivage ne doit pas dépasser 500 caractères.");
    }
}
