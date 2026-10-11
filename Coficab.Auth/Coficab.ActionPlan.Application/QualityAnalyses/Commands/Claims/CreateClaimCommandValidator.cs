using FluentValidation;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

/// <summary>Limits mirror the database columns (Claim entity configuration).</summary>
public class CreateClaimCommandValidator : AbstractValidator<CreateClaimCommand>
{
    public CreateClaimCommandValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Le titre de la réclamation est obligatoire.")
            .MaximumLength(200).WithMessage("Le titre ne doit pas dépasser 200 caractères.");

        RuleFor(x => x.ClientId)
            .NotEmpty().WithMessage("Le client concerné doit être spécifié.")
            .MaximumLength(100).WithMessage("L'identifiant client ne doit pas dépasser 100 caractères.");

        RuleFor(x => x.DefectType)
            .NotEmpty().WithMessage("Le type de défaut est obligatoire.")
            .MaximumLength(100).WithMessage("Le type de défaut ne doit pas dépasser 100 caractères.");

        // Enum: LOW is the default value (0), so NotEmpty would wrongly reject it.
        RuleFor(x => x.Severity)
            .IsInEnum().WithMessage("Le niveau de gravité est invalide.");

        RuleFor(x => x.LotNumber)
            .NotEmpty().WithMessage("Le numéro de lot est obligatoire pour la traçabilité IATF 16949.")
            .MaximumLength(100).WithMessage("Le numéro de lot ne doit pas dépasser 100 caractères.");

        RuleFor(x => x.SerialNumber)
            .MaximumLength(100).WithMessage("Le numéro de série ne doit pas dépasser 100 caractères.");

        RuleFor(x => x.Description)
            .NotEmpty().WithMessage("La description détaillée du défaut est obligatoire.")
            .MaximumLength(2000).WithMessage("La description ne doit pas dépasser 2000 caractères.");

        RuleFor(x => x.CreatedById)
            .NotEmpty().WithMessage("L'identifiant de l'auteur est obligatoire.");

        RuleFor(x => x.ProducedQuantity)
            .GreaterThanOrEqualTo(0).WithMessage("La quantité produite ne peut pas être négative.")
            .When(x => x.ProducedQuantity.HasValue);

        RuleFor(x => x.DefectiveQuantity)
            .GreaterThanOrEqualTo(0).WithMessage("La quantité défectueuse ne peut pas être négative.")
            .When(x => x.DefectiveQuantity.HasValue);

        RuleFor(x => x)
            .Must(x => !x.ProducedQuantity.HasValue || !x.DefectiveQuantity.HasValue || x.DefectiveQuantity <= x.ProducedQuantity)
            .WithMessage("La quantité défectueuse ne peut pas dépasser la quantité produite.")
            .WithName("DefectiveQuantity");
    }
}
