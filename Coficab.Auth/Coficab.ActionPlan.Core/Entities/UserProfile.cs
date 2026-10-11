using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.Core.Entities;

public class UserProfile
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty; // Identity user ID (sub)
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? Phone { get; set; }
    /// <summary>Poste / fonction — obligatoire.</summary>
    public string Poste { get; set; } = string.Empty;
    /// <summary>Ligne de production — optionnel.</summary>
    public string? LigneProduction { get; set; }
    /// <summary>Équipe — obligatoire.</summary>
    public string Equipe { get; set; } = string.Empty;
    public string? ProfilePictureUrl { get; set; }
    // Department relation
    public Guid? DepartmentId { get; set; }
    public Department? Department { get; set; }

    // Manager relation
    public string? ManagerId { get; set; }
    public string? ManagerName { get; set; }
    public string? ManagerEmail { get; set; }

    public DateTime HireDate { get; set; }
    /// <summary>Statut RH (active, onLeave, remote) — distinct du verrouillage IAM.</summary>
    public string Status { get; set; } = "active";

    /// <summary>Statut d'activité calculé (Active / LowActivity / Inactive).</summary>
    public ActivityStatus ActivityStatus { get; set; } = ActivityStatus.Inactive;

    /// <summary>Dernière activité retenue (login ou action métier).</summary>
    public DateTime? LastActivityAt { get; set; }

    /// <summary>Dernière connexion IAM synchronisée.</summary>
    public DateTime? LastLoginAt { get; set; }

    /// <summary>Horodatage du dernier recalcul d'activité.</summary>
    public DateTime? ActivityStatusComputedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
