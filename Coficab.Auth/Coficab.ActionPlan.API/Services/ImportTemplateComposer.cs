using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore.Metadata;

namespace Coficab.ActionPlan.API.Services;

public sealed record ImportColumnDto(string Key, string Label, string Example, bool Required);

/// <summary>
/// Builds an import template from the EF model. A new mapped scalar column
/// appears on the next download. Keys, labels and the example row live here
/// only as display data, not as the list of columns.
/// </summary>
public static class ImportTemplateComposer
{
    private static readonly Dictionary<string, string[]> RequiredKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        ["plans"] = ["Title", "Type", "Department"],
        ["claims"] = ["Title", "DefectType"],
        ["employees"] = ["FullName", "Email"],
    };

    private static readonly HashSet<string> Technical = new(StringComparer.OrdinalIgnoreCase)
    {
        "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy", "IsArchived", "ArchivedAt", "ArchivedBy",
        "CompletedAt", "IsOnTime", "Progress", "OwnerId", "UserId", "ManagerId", "ManagerName", "ManagerEmail",
        "AssignedToId", "AssignedToName", "AssignedAt", "ProfilePictureUrl", "HireDate",
        "LastActivityAt", "LastLoginAt", "ActivityStatus", "ActivityStatusComputedAt",
        "AttachmentName", "AttachmentContentType", "AttachmentData",
        "EstimatedDaysP50", "EstimatedDaysP80", "EstimateMethod", "EstimateSampleSize", "EstimatedAt",
        "PasswordHash", "SecurityStamp", "ConcurrencyStamp", "UserName", "NormalizedUserName", "NormalizedEmail",
        "EmailConfirmed", "PhoneNumber", "PhoneNumberConfirmed", "TwoFactorEnabled",
        "LockoutEnd", "LockoutEnabled", "AccessFailedCount",
    };

    private static readonly Dictionary<string, string> Labels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Title"] = "Titre",
        ["Description"] = "Description",
        ["Type"] = "Type",
        ["Status"] = "Statut",
        ["StatusCode"] = "Statut",
        ["Deadline"] = "Date limite",
        ["DetectionDate"] = "Date de détection",
        ["Department"] = "Département",
        ["Organization"] = "Organisation",
        ["FullName"] = "Nom complet",
        ["Email"] = "E-mail",
        ["Role"] = "Rôle",
        ["Poste"] = "Poste",
        ["Equipe"] = "Équipe",
        ["Phone"] = "Téléphone",
        ["LigneProduction"] = "Ligne de production",
        ["ClientId"] = "Client",
        ["DefectType"] = "Type de défaut",
        ["Severity"] = "Gravité",
        ["LotNumber"] = "Numéro de lot",
        ["SerialNumber"] = "Numéro de série",
        ["ProductionLine"] = "Ligne de production",
        ["Shift"] = "Quart",
        ["AnalysisNotes"] = "Notes d'analyse",
        ["ProducedQuantity"] = "Quantité produite",
        ["DefectiveQuantity"] = "Quantité défectueuse",
    };

    private static readonly Dictionary<string, string> Examples = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Title"] = "EXEMPLE Câble hors tolérance",
        ["Type"] = "préventif",
        ["Deadline"] = "2026-12-31",
        ["Status"] = "Créé",
        ["StatusCode"] = "DRAFT",
        ["Department"] = "Qualité",
        ["Organization"] = "COFICAB",
        ["Description"] = "Déformation constatée en fin de ligne",
        ["FullName"] = "EXEMPLE Marie Dupont",
        ["Email"] = "marie.dupont@exemple.com",
        ["Role"] = "user",
        ["Poste"] = "Contrôleur qualité",
        ["Equipe"] = "Équipe A",
        ["Phone"] = "+21620000000",
        ["ClientId"] = "CL-100",
        ["DefectType"] = "Sertissage",
        ["Severity"] = "Haute",
        ["LotNumber"] = "LOT-2026-001",
        ["SerialNumber"] = "SN-0001",
        ["ProductionLine"] = "Ligne 1",
        ["LigneProduction"] = "Ligne 1",
        ["Shift"] = "Matin",
        ["AnalysisNotes"] = "Contrôle visuel",
    };

    public static IReadOnlyList<ImportColumnDto> Columns(IModel model, Type entityType, string entity)
    {
        var mapped = model.FindEntityType(entityType)
            ?? throw new InvalidOperationException($"Entité {entityType.Name} absente du modèle EF.");

        var columns = new List<ImportColumnDto>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var property in mapped.GetProperties())
        {
            if (property.IsShadowProperty() || property.IsPrimaryKey())
                continue;
            if (Technical.Contains(property.Name) || property.Name.EndsWith("ById", StringComparison.OrdinalIgnoreCase))
                continue;
            if (property.ClrType == typeof(byte[]))
                continue;

            if (property.IsForeignKey() || property.ClrType == typeof(Guid) || property.ClrType == typeof(Guid?))
            {
                var navigation = mapped.GetNavigations()
                    .FirstOrDefault(nav => nav.ForeignKey.Properties.Contains(property));
                if (navigation?.TargetEntityType.FindProperty("Name") == null)
                    continue;
                Add(columns, seen, entity, navigation.Name);
                continue;
            }

            if (!IsImportScalar(property.ClrType))
                continue;

            Add(columns, seen, entity, property.Name);
        }

        var required = RequiredKeys.TryGetValue(entity, out var keys) ? keys : Array.Empty<string>();
        return columns
            .OrderBy(column =>
            {
                var index = Array.FindIndex(required, key => key.Equals(column.Key, StringComparison.OrdinalIgnoreCase));
                return index < 0 ? required.Length + columns.IndexOf(column) : index;
            })
            .ToList();
    }

    public static byte[] Build(IReadOnlyList<ImportColumnDto> columns, string format)
    {
        var labels = columns.Select(column => column.Label).ToArray();
        var example = columns.Select(column => column.Example).ToArray();
        if (string.Equals(format, "excel", StringComparison.OrdinalIgnoreCase))
            return Encoding.UTF8.GetBytes(Spreadsheet(labels, example));

        var csv = new StringBuilder();
        csv.Append('\uFEFF');
        csv.AppendLine(string.Join(';', labels.Select(EscapeCsv)));
        csv.AppendLine(string.Join(';', example.Select(EscapeCsv)));
        return Encoding.UTF8.GetBytes(csv.ToString());
    }

    public static int HeaderIndex(IReadOnlyList<string> header, params string[] aliases)
    {
        var folded = header.Select(Fold).ToList();
        foreach (var alias in aliases)
        {
            var key = Fold(alias);
            var index = folded.FindIndex(cell => cell == key);
            if (index >= 0) return index;
        }
        return -1;
    }

    public static bool IsExample(string? value) =>
        Fold(value ?? string.Empty).StartsWith("exemple", StringComparison.Ordinal);

    public static string Fold(string value)
    {
        var trimmed = value.Trim().TrimStart('\uFEFF').ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(trimmed.Length);
        foreach (var ch in trimmed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                builder.Append(ch);
        }
        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    private static void Add(List<ImportColumnDto> columns, HashSet<string> seen, string entity, string propertyName)
    {
        var key = entity.Equals("employees", StringComparison.OrdinalIgnoreCase) && propertyName == "Name"
            ? "FullName"
            : propertyName;
        if (!seen.Add(key))
            return;

        var sample = ExampleFor(key, propertyName);
        if (entity.Equals("plans", StringComparison.OrdinalIgnoreCase) && key == "Title")
            sample = "EXEMPLE Plan déformation câble";
        if (entity.Equals("employees", StringComparison.OrdinalIgnoreCase) && key == "Status")
            sample = "active";
        var required = RequiredKeys.TryGetValue(entity, out var keys)
            && keys.Any(item => item.Equals(key, StringComparison.OrdinalIgnoreCase));
        columns.Add(new ImportColumnDto(key, LabelFor(key), sample, required));
    }

    private static string LabelFor(string key)
    {
        if (Labels.TryGetValue(key, out var label))
            return label;
        var spaced = System.Text.RegularExpressions.Regex.Replace(key, "([a-z])([A-Z])", "$1 $2");
        return spaced.Length == 0 ? key : char.ToUpperInvariant(spaced[0]) + spaced[1..];
    }

    private static string ExampleFor(string key, string propertyName)
    {
        if (Examples.TryGetValue(key, out var sample))
            return sample;
        var typeName = propertyName;
        if (typeName.Contains("Date", StringComparison.OrdinalIgnoreCase))
            return DateTime.UtcNow.ToString("yyyy-MM-dd");
        if (typeName.Contains("Quantity", StringComparison.OrdinalIgnoreCase) || typeName.StartsWith("Is", StringComparison.Ordinal))
            return typeName.StartsWith("Is", StringComparison.Ordinal) ? "oui" : "1";
        return "EXEMPLE";
    }

    private static bool IsImportScalar(Type type)
    {
        var actual = Nullable.GetUnderlyingType(type) ?? type;
        return actual == typeof(string)
            || actual == typeof(bool)
            || actual == typeof(int)
            || actual == typeof(long)
            || actual == typeof(short)
            || actual == typeof(decimal)
            || actual == typeof(double)
            || actual == typeof(float)
            || actual == typeof(DateTime)
            || actual == typeof(DateTimeOffset)
            || actual.IsEnum;
    }

    private static string EscapeCsv(string value) => $"\"{(value ?? string.Empty).Replace("\"", "\"\"")}\"";

    private static string Spreadsheet(string[] labels, string[] example)
    {
        static string Cell(string value) =>
            $"<Cell><Data ss:Type=\"String\">{System.Net.WebUtility.HtmlEncode(value ?? string.Empty)}</Data></Cell>";

        return $"""
            <?xml version="1.0"?>
            <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
            <Worksheet ss:Name="Modele"><Table>
            <Row>{string.Concat(labels.Select(Cell))}</Row>
            <Row>{string.Concat(example.Select(Cell))}</Row>
            </Table></Worksheet></Workbook>
            """;
    }
}
