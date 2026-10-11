using FluentValidation;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;

public class ValidateFiveWhyCommandValidator : AbstractValidator<ValidateFiveWhyCommand>
{
    public ValidateFiveWhyCommandValidator()
    {
        RuleFor(x => x.AnalysisId)
            .NotEmpty()
            .WithMessage("L'identifiant de l'analyse est obligatoire.");

        RuleFor(x => x.ValidatedBy)
            .NotEmpty()
            .WithMessage("L'identifiant du valideur est obligatoire.");
    }
}