using FluentValidation;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

public class CreateOrUpdateIshikawaCommandValidator : AbstractValidator<CreateOrUpdateIshikawaCommand>
{
    public CreateOrUpdateIshikawaCommandValidator()
    {
        RuleFor(x => x.ClaimId)
            .NotEmpty().WithMessage("La réclamation associée est obligatoire.");

        RuleFor(x => x.UserId)
            .NotEmpty().WithMessage("L'identifiant utilisateur est requis pour la traçabilité.");

        RuleForEach(x => x.Causes).ChildRules(cause =>
        {
            cause.RuleFor(c => c.Category)
                .IsInEnum().WithMessage("La catégorie Ishikawa doit faire partie des 6M.");

            cause.RuleFor(c => c.CauseDescription)
                .NotEmpty().WithMessage("La description de la cause est obligatoire.")
                .MaximumLength(500).WithMessage("La description de la cause ne doit pas dépasser 500 caractères.");
        });
    }
}