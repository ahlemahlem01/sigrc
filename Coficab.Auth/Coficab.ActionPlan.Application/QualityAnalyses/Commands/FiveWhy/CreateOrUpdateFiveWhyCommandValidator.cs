using FluentValidation;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;

/// <summary>
/// A 5 Why is saved as a draft while the analyst is still working: answers and the problem statement may be
/// incomplete, so only shape and lengths are checked here (completeness is enforced when it is sent for validation).
/// </summary>
public class CreateOrUpdateFiveWhyCommandValidator : AbstractValidator<CreateOrUpdateFiveWhyCommand>
{
    public CreateOrUpdateFiveWhyCommandValidator()
    {
        RuleFor(x => x.ClaimId)
            .NotEmpty().WithMessage("La réclamation associée est obligatoire.");

        RuleFor(x => x.ProblemStatement)
            .MaximumLength(1000).WithMessage("La description ne doit pas dépasser 1000 caractères.");

        RuleFor(x => x.UserId)
            .NotEmpty().WithMessage("L'identifiant utilisateur est requis pour l'audit.");

        RuleFor(x => x.Steps)
            .Must(steps => steps == null || steps.Count <= 5)
            .WithMessage("L'analyse 5 Why ne peut pas dépasser 5 étapes.");

        RuleForEach(x => x.Steps).ChildRules(step =>
        {
            step.RuleFor(s => s.StepNumber)
                .InclusiveBetween(1, 5).WithMessage("Le numéro d'étape doit être entre 1 et 5.");
            step.RuleFor(s => s.Question)
                .MaximumLength(500).WithMessage("Une question ne doit pas dépasser 500 caractères.");
            step.RuleFor(s => s.Answer)
                .MaximumLength(1000).WithMessage("Une réponse ne doit pas dépasser 1000 caractères.");
        });
    }
}
