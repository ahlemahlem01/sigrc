namespace Coficab.ReferenceDataLoader;

/// <summary>
/// Catalogue métier câblage automobile (FR) — contenu destiné à paraître
/// comme un historique qualité site, sans marqueur de génération visible.
/// </summary>
internal static class RealisticClaimCatalog
{
    public static readonly string[] Clients =
    [
        "BMW-DEB-4521", "BMW-REG-3301", "VW-AUD-1180", "VW-WOL-2044",
        "STELLANTIS-MUL", "PSA-SOCH-220", "RENAULT-FLINS", "RENAULT-SAN",
        "DAIMLER-STUT", "FORD-VALENCIA", "TOYOTA-VAL", "VALEO-TUNIS",
        "LEONI-SOUSSE", "YAZAKI-BIZERTE", "APTIV-MOROCCO", "SUMITOMO-TN"
    ];

    public static readonly string[] Lines =
    [
        "WR-01", "WR-02", "WR-03", "WR-04", "WR-05", "WR-06",
        "EXT-01", "EXT-02", "CUT-01", "CUT-02", "ASM-01", "ASM-03", "TEST-01"
    ];

    public static readonly string[] Shifts = ["Matin", "Après-midi", "Nuit", "Équipe A", "Équipe B"];

    public static readonly string[] Severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

    /// <summary>Défauts avec poids (plus fréquents en tête de liste).</summary>
    public static readonly (string Defect, int Weight)[] DefectWeights =
    [
        ("Soudure défectueuse", 22),
        ("Isolation endommagée", 18),
        ("Dimension hors tolérance", 14),
        ("Coupure fil", 12),
        ("Manque de sertissage", 11),
        ("Débordement étain", 10),
        ("Connecteur desserré", 9),
        ("Marquage illisible", 8),
        ("Couleur incorrecte", 7),
        ("Contamination surface", 7),
        ("Non-conformité emballage", 6),
        ("Étiquette manquante", 5),
        ("Polarité inversée", 4),
        ("Longueur câble incorrecte", 4),
    ];

    public static readonly (string Status, int Weight)[] StatusWeights =
    [
        ("OUVERTE", 12),
        ("ASSIGNED", 16),
        ("EN_ANALYSE", 22),
        ("PENDING_VALIDATION", 10),
        ("VALIDATED", 12),
        ("CLOTUREE", 48),
    ];

    public sealed record Scenario(
        string Defect,
        string Line,
        string TitleTemplate,
        string DescriptionTemplate);

    /// <summary>Scénarios rédigés comme des constats atelier / client.</summary>
    public static readonly Scenario[] Scenarios =
    [
        new("Soudure défectueuse", "WR-04",
            "Soudure {zone} ancrage {side} — robot {line}",
            "Point de soudure {zone} non conforme sur faisceau client {client}. Aspect poreux / manque de pénétration. Lot {lot}. Historique récent suggère usure électrodes ou déréglage pince. Ligne {line}, équipe {shift}."),

        new("Soudure défectueuse", "WR-04",
            "Récurrence soudure ancrage — {line}",
            "Même famille de défaut que les interventions WR-04 : soudure ancrage côté {side}. Contrôle 100 % demandé sur le lot {lot}. Client {client}."),

        new("Soudure défectueuse", "WR-05",
            "Soudure froide connecteur {zone} — {line}",
            "Soudure froide détectée au contrôle électrique. Résistance hors spec sur le circuit {zone}. Ligne {line}, lot {lot}, client {client}."),

        new("Isolation endommagée", "EXT-01",
            "Isolation abrasée sur {zone} — extrusion {line}",
            "Gaine d'isolation endommagée (abrasion / pincement) sur tronçon {zone}. Risque court-circuit. Détection en fin de ligne {line}. Lot {lot}, client {client}."),

        new("Isolation endommagée", "CUT-02",
            "Coupure partielle isolation — {line}",
            "Isolation partiellement sectionnée après coupe. Suspicion lame usée ou guide mal réglé. Lot {lot}, ligne {line}, client {client}."),

        new("Dimension hors tolérance", "CUT-01",
            "Longueur hors tolérance ±{tol} mm — {line}",
            "Mesure hors cote sur longueur de branche {zone}. Tolérance dépassée. Échantillon {qty} NC sur {prod} produits. Ligne {line}, lot {lot}."),

        new("Coupure fil", "ASM-03",
            "Fil sectionné au sertissage — {line}",
            "Conducteur sectionné au niveau de la zone de sertissage {zone}. Cause probable : hauteur de sertissage incorrecte. Client {client}, lot {lot}."),

        new("Manque de sertissage", "ASM-01",
            "Sertissage incomplet terminal {zone}",
            "Hauteur / largeur de sertissage hors fenêtre. Terminal {zone} mal formé. Contrôle crimp force non conforme. Ligne {line}, lot {lot}, client {client}."),

        new("Débordement étain", "WR-02",
            "Débordement étain soudure {zone}",
            "Excès d'étain avec risque de pontage entre plots. Paramètres fours / fer à vérifier. Ligne {line}, lot {lot}."),

        new("Connecteur desserré", "ASM-03",
            "Connecteur {zone} mal verrouillé — {line}",
            "CPA / levier de verrouillage non enclenché. Risque de déconnexion en montage client. Lot {lot}, client {client}."),

        new("Marquage illisible", "TEST-01",
            "Marquage inkjet illisible — lot {lot}",
            "Code lot / référence illisible après marquage. Encre ou tête d'impression à contrôler. Ligne {line}."),

        new("Couleur incorrecte", "EXT-02",
            "Couleur gaine incorrecte — {zone}",
            "Couleur de gaine non conforme au plan (attendu vs reçu). Risque d'erreur de câblage. Client {client}, lot {lot}."),

        new("Contamination surface", "WR-01",
            "Contamination huile / particules — {line}",
            "Traces de contamination sur zone de soudure {zone}. Nettoyage poste et gants à renforcer. Lot {lot}."),

        new("Non-conformité emballage", "ASM-01",
            "Emballage non conforme expédition — {client}",
            "Conditionnement hors standard client (séparateurs / étiquette manquante). Lot {lot} bloqué quai expédition."),

        new("Étiquette manquante", "TEST-01",
            "Étiquette absente lot {lot}",
            "Étiquette identification produit manquante sur carton / bobine. Traçabilité interrompue. Client {client}."),

        new("Polarité inversée", "ASM-03",
            "Polarité inversée circuit {zone}",
            "Inversion de polarité détectée au test électrique. Erreur d'insertion ou de plan de câblage. Ligne {line}, lot {lot}."),

        new("Longueur câble incorrecte", "CUT-02",
            "Longueur câble hors cote — {line}",
            "Longueur mesurée hors tolérance sur référence client {client}. Recoupe / réglage table de coupe nécessaire. Lot {lot}."),
    ];

    public static string PickWeighted(Random rng, (string Value, int Weight)[] weights)
    {
        var total = weights.Sum(w => w.Weight);
        var roll = rng.Next(total);
        var acc = 0;
        foreach (var (value, weight) in weights)
        {
            acc += weight;
            if (roll < acc) return value;
        }
        return weights[^1].Value;
    }

    public static string Render(string template, IReadOnlyDictionary<string, string> vars)
    {
        var s = template;
        foreach (var (k, v) in vars)
            s = s.Replace("{" + k + "}", v, StringComparison.Ordinal);
        return s;
    }
}
