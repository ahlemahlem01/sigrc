namespace Coficab.Auth.API.Services;

/// <summary>An administrator creates simple user accounts, in his own department only. The superadmin is not restricted.</summary>
public static class AdminAccountScope
{
    /// <summary>An error text when the administrator may not create this account; null when allowed.</summary>
    public static string? Check(string? role, Guid? requestOrganization, Guid? requestDepartment, Guid? callerOrganization, Guid? callerDepartment)
    {
        if (!string.IsNullOrEmpty(role) && role != "user")
            return "Seul un superadmin peut créer un admin ou un superadmin.";
        if (callerOrganization == null || callerDepartment == null)
            return "Votre compte n'est rattaché à aucun département : impossible de créer un compte.";
        if ((requestOrganization != null && requestOrganization != callerOrganization)
            || (requestDepartment != null && requestDepartment != callerDepartment))
            return "Un administrateur crée des comptes dans son propre département uniquement.";
        return null;
    }
}
