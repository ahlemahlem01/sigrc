namespace Coficab.ReferenceDataLoader;

internal sealed record EmployeeBlueprint(
    string FullName,
    string DepartmentName,
    string DepartmentCode,
    string Poste,
    string Equipe,
    string? LigneProduction);

internal sealed record DeptBlueprint(string Name, string Code, string Description);

internal static class ReferenceCatalog
{
    public static readonly DeptBlueprint[] Departments =
    [
        new("Qualite", "SEED-QUAL", "Departement Qualite (testdata)"),
        new("Production", "SEED-PROD", "Departement Production (testdata)"),
        new("Maintenance", "SEED-MAINT", "Departement Maintenance (testdata)"),
        new("Logistique", "SEED-LOG", "Departement Logistique (testdata)"),
        new("Ressources Humaines", "SEED-RH", "Departement RH (testdata)"),
    ];

    public static readonly string[] Clients =
    [
        "BMW-DEB-4521", "VW-AUD-1180", "PSA-SOCH-220", "RENAULT-FLINS", "STELLANTIS-MUL",
        "DAIMLER-STUT", "FORD-VAL", "TOYOTA-VAL", "VALEO-TUN", "LEONI-SOUSSE"
    ];

    public static readonly string[] DefectTypes =
    [
        "Soudure defectueuse", "Isolation endommagee", "Dimension hors tolerance",
        "Contaminations surface", "Manque de sertissage", "Marquage illegible",
        "Couleur incorrecte", "Coupure fil", "Debordement etain", "Non-conformite emballage"
    ];

    public static readonly string[] Severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

    public static readonly string[] Lines =
    [
        "WR-01", "WR-02", "WR-03", "WR-04", "WR-05", "WR-06", "EXT-01", "CUT-02", "ASM-03"
    ];

    public static readonly string[] Teams = ["Matin", "Soir", "Nuit", "Equipe A", "Equipe B"];

    public static readonly EmployeeBlueprint[] Employees =
    [
        new("Amine Ben Youssef", "Qualite", "SEED-QUAL", "Controleur Qualite", "Equipe A", "WR-01"),
        new("Sarra Mansouri", "Qualite", "SEED-QUAL", "Ingenieur Qualite", "Equipe B", "WR-02"),
        new("Youssef Trabelsi", "Qualite", "SEED-QUAL", "Auditeur Interne", "Matin", null),
        new("Nour El Houda", "Qualite", "SEED-QUAL", "Technicien Metrologie", "Soir", "WR-03"),
        new("Karim Jebali", "Production", "SEED-PROD", "Operateur Production", "Matin", "WR-01"),
        new("Ines Gharbi", "Production", "SEED-PROD", "Operateur Production", "Soir", "WR-02"),
        new("Mehdi Chaabane", "Production", "SEED-PROD", "Chef d equipe", "Equipe A", "WR-04"),
        new("Rania Bouazizi", "Production", "SEED-PROD", "Operateur Extrusion", "Nuit", "EXT-01"),
        new("Hichem Saidi", "Production", "SEED-PROD", "Regleur Machine", "Matin", "CUT-02"),
        new("Lina Khelifi", "Production", "SEED-PROD", "Agent de Ligne", "Equipe B", "ASM-03"),
        new("Omar Belhaj", "Maintenance", "SEED-MAINT", "Technicien Maintenance", "Matin", "WR-05"),
        new("Fatma Dridi", "Maintenance", "SEED-MAINT", "Electrotechnicien", "Soir", "WR-06"),
        new("Sami Hammami", "Maintenance", "SEED-MAINT", "Mecanicien Industrial", "Equipe A", "EXT-01"),
        new("Aya Mabrouk", "Maintenance", "SEED-MAINT", "Planificateur Maintenance", "Matin", null),
        new("Bilel Amri", "Logistique", "SEED-LOG", "Magasinier", "Equipe A", null),
        new("Hana Rebai", "Logistique", "SEED-LOG", "Preparateur Commandes", "Soir", null),
        new("Walid Cherif", "Logistique", "SEED-LOG", "Coordinateur Expeditions", "Matin", null),
        new("Meriem Zouari", "Ressources Humaines", "SEED-RH", "Gestionnaire RH", "Equipe A", null),
        new("Anis Kadri", "Ressources Humaines", "SEED-RH", "Assistant RH", "Equipe B", null),
        new("Salma Ayari", "Production", "SEED-PROD", "Ingenieur Process", "Matin", "WR-03"),
    ];

    /// <summary>Weighted claim statuses for a plausible open/closed mix.</summary>
    public static readonly (string Status, int Weight)[] ClaimStatusWeights =
    [
        ("DRAFT", 8),
        ("OUVERTE", 18),
        ("ASSIGNED", 18),
        ("EN_ANALYSE", 28),
        ("PENDING_VALIDATION", 12),
        ("VALIDATED", 16),
        ("CLOTUREE", 50),
    ];

    public static string PickWeighted(Random rng, (string Status, int Weight)[] weights)
    {
        var total = weights.Sum(w => w.Weight);
        var roll = rng.Next(total);
        var acc = 0;
        foreach (var (status, weight) in weights)
        {
            acc += weight;
            if (roll < acc) return status;
        }
        return weights[^1].Status;
    }
}
