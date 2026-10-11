namespace Coficab.ActionPlan.Core.Entities;

/// <summary>
/// Embedding sémantique (Gemini) pour claims et plans d'action.
/// Vecteur stocké en JSON (float[]), classé en mémoire.
/// </summary>
public class SemanticEmbedding
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>claim | action_plan</summary>
    public string EntityType { get; set; } = string.Empty;

    public Guid EntityId { get; set; }

    /// <summary>SHA256 du texte canonique indexé (évite les re-embeddings inutiles).</summary>
    public string ContentHash { get; set; } = string.Empty;

    public string Model { get; set; } = string.Empty;

    /// <summary>Vecteur JSON : [0.1, -0.2, ...]</summary>
    public string EmbeddingJson { get; set; } = "[]";

    public DateTime EmbeddedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public static class SemanticEntityTypes
{
    public const string Claim = "claim";
    public const string ActionPlan = "action_plan";
}
