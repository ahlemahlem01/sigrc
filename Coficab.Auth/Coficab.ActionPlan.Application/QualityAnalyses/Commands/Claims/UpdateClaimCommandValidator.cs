using Coficab.ActionPlan.Core.Enums;
using FluentValidation;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;

/// <summary>Partial update: only the fields that are sent are checked. Limits mirror the database columns.</summary>
public class UpdateClaimCommandValidator : AbstractValidator<UpdateClaimCommand>
{
    public UpdateClaimCommandValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty().WithMessage("L'identifiant de la réclamation est obligatoire.");

        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Le titre de la réclamation ne peut pas être vide.")
            .MaximumLength(200).WithMessage("Le titre ne doit pas dépasser 200 caractères.")
            .When(x => x.Title != null);

        RuleFor(x => x.ClientId)
            .MaximumLength(100).WithMessage("L'identifiant client ne doit pas dépasser 100 caractères.")
            .When(x => x.ClientId != null);

        RuleFor(x => x.DefectType)
            .MaximumLength(100).WithMessage("Le type de défaut ne doit pas dépasser 100 caractères.")
            .When(x => x.DefectType != null);

        RuleFor(x => x.LotNumber)
            .MaximumLength(100).WithMessage("Le numéro de lot ne doit pas dépasser 100 caractères.")
            .When(x => x.LotNumber != null);

        RuleFor(x => x.SerialNumber)
            .MaximumLength(100).WithMessage("Le numéro de série ne doit pas dépasser 100 caractères.")
            .When(x => x.SerialNumber != null);

        RuleFor(x => x.Description)
            .MaximumLength(2000).WithMessage("La description ne doit pas dépasser 2000 caractères.")
            .When(x => x.Description != null);

        // The screens send LOW / MEDIUM / HIGH / CRITICAL (any case).
        RuleFor(x => x.Severity)
            .Must(severity => Enum.TryParse<ClaimSeverity>(severity, true, out _))
            .WithMessage("La gravité doit être : LOW, MEDIUM, HIGH ou CRITICAL.")
            .When(x => !string.IsNullOrWhiteSpace(x.Severity));

        RuleFor(x => x.ProducedQuantity)
            .GreaterThanOrEqualTo(0).WithMessage("La quantité produite ne peut pas être négative.")
            .When(x => x.ProducedQuantity.HasValue);

        RuleFor(x => x.DefectiveQuantity)
            .GreaterThanOrEqualTo(0).WithMessage("La quantité défectueuse ne peut pas être négative.")
            .When(x => x.DefectiveQuantity.HasValue);

        RuleFor(x => x.UpdatedById)
            .NotEmpty().WithMessage("L'identifiant de l'utilisateur est requis pour la mise à jour.");
    }
}
