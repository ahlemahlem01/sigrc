using Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

/// <summary>
/// Four eyes: nobody validates or closes a claim he analysed himself. The person in charge of the claim, the champion of its
/// 8D dossier and the person who submitted it cannot be the one who validates it; another administrator does.
/// </summary>
public static class SelfValidationGate
{
    public const string Message = "Vous ne pouvez pas valider ni clôturer un dossier que vous avez analysé ou soumis : un autre administrateur doit le faire.";

    /// <summary>True when the user took part in the analysis (so he must not validate it).</summary>
    public static bool TookPart(Claim claim, EightDDossier? dossier, string? userId)
    {
        if (string.IsNullOrWhiteSpace(userId)) return false;
        bool Same(string? other) => !string.IsNullOrWhiteSpace(other) && string.Equals(other.Trim(), userId.Trim(), StringComparison.OrdinalIgnoreCase);
        return Same(claim.AssignedToId) || Same(dossier?.ChampionId) || Same(dossier?.SubmittedById);
    }
}
