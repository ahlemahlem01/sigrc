using System.Globalization;
using ClosedXML.Excel;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;

namespace Coficab.ActionPlan.API.Services;

public sealed record HistoryClaimRow(
    int Line,
    string Reference,
    string Title,
    string ClientId,
    string DefectType,
    string Severity,
    string LotNumber,
    string Description,
    DateTime DetectionDate,
    DateTime? ClosedDate,
    string? ProductionLine,
    string? Shift,
    int? ProducedQuantity,
    int? DefectiveQuantity);

public sealed record HistoryCauseRow(
    int Line,
    string Reference,
    IshikawaCategory Category,
    string Description,
    bool IsRootCause);

public sealed record HistoryIssue(string Sheet, int Line, string Message);

public sealed class ParsedHistory
{
    public List<HistoryClaimRow> Claims { get; } = new();
    public List<HistoryCauseRow> Causes { get; } = new();
    public List<HistoryIssue> Errors { get; } = new();
}

/// <summary>
/// Reads the "historical dossiers" workbook (sheets Reclamations + Causes) or a claims-only CSV.
/// Nothing is written here: the controller decides what to do with the parsed rows.
/// </summary>
public static class HistoryImportParser
{
    public const string ClaimsSheet = "Reclamations";
    public const string CausesSheet = "Causes";

    public static readonly string[] ClaimHeaders =
    {
        "Reference", "Titre", "Client", "Type de defaut", "Gravite", "Numero de lot", "Description",
        "Date de detection", "Date de cloture", "Ligne de production", "Equipe",
        "Quantite produite", "Quantite defectueuse",
    };

    public static readonly string[] CauseHeaders = { "Reference", "Categorie 6M", "Description de la cause", "Cause racine (oui/non)" };

    public static ParsedHistory Parse(Stream stream, string fileName)
    {
        var result = new ParsedHistory();
        var isCsv = fileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase);
        List<List<string>> claimRows;
        List<List<string>>? causeRows = null;

        if (isCsv)
        {
            using var reader = new StreamReader(stream);
            claimRows = ReadCsv(reader.ReadToEnd());
        }
        else
        {
            try
            {
                using var workbook = new XLWorkbook(stream);
                var claimsSheet = FindSheet(workbook, ClaimsSheet) ?? workbook.Worksheets.FirstOrDefault();
                if (claimsSheet == null)
                {
                    result.Errors.Add(new HistoryIssue(ClaimsSheet, 0, "Le classeur est vide."));
                    return result;
                }
                claimRows = ReadSheet(claimsSheet);
                var causesSheet = FindSheet(workbook, CausesSheet);
                if (causesSheet != null) causeRows = ReadSheet(causesSheet);
            }
            catch (Exception ex) when (ex is not OutOfMemoryException)
            {
                result.Errors.Add(new HistoryIssue(ClaimsSheet, 0, "Fichier Excel illisible : " + ex.Message));
                return result;
            }
        }

        ParseClaims(claimRows, result);
        if (causeRows != null) ParseCauses(causeRows, result);
        return result;
    }

    private static IXLWorksheet? FindSheet(XLWorkbook workbook, string name) =>
        workbook.Worksheets.FirstOrDefault(s => ImportTemplateComposer.Fold(s.Name) == ImportTemplateComposer.Fold(name));

    private static List<List<string>> ReadSheet(IXLWorksheet sheet)
    {
        var rows = new List<List<string>>();
        var range = sheet.RangeUsed();
        if (range == null) return rows;
        var firstCol = range.FirstColumn().ColumnNumber();
        var lastCol = range.LastColumn().ColumnNumber();
        foreach (var row in range.Rows())
        {
            var cells = new List<string>();
            for (var c = firstCol; c <= lastCol; c++)
            {
                var cell = row.Cell(c - firstCol + 1);
                cells.Add(cell.DataType == XLDataType.DateTime
                    ? cell.GetDateTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                    : cell.GetFormattedString().Trim());
            }
            rows.Add(cells);
        }
        return rows;
    }

    private static List<List<string>> ReadCsv(string text)
    {
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length == 0) return new();
        var delimiter = lines[0].Contains(';') && !lines[0].Contains(',') ? ';' : ',';
        return lines.Select(l => SplitCsvLine(l, delimiter)).ToList();
    }

    private static List<string> SplitCsvLine(string line, char delimiter)
    {
        var cells = new List<string>();
        var current = new System.Text.StringBuilder();
        var quoted = false;
        foreach (var ch in line)
        {
            if (ch == '"') { quoted = !quoted; continue; }
            if (ch == delimiter && !quoted) { cells.Add(current.ToString().Trim()); current.Clear(); continue; }
            current.Append(ch);
        }
        cells.Add(current.ToString().Trim());
        return cells;
    }

    private static void ParseClaims(List<List<string>> rows, ParsedHistory result)
    {
        if (rows.Count < 2)
        {
            result.Errors.Add(new HistoryIssue(ClaimsSheet, 1, "Aucune ligne de données (en-tête attendu en première ligne)."));
            return;
        }

        var h = rows[0];
        int Col(params string[] aliases) => ImportTemplateComposer.HeaderIndex(h, aliases);
        var iRef = Col("reference", "ref", "id");
        var iTitle = Col("titre", "title");
        var iClient = Col("client", "clientid");
        var iDefect = Col("type de defaut", "defecttype", "defaut");
        var iSev = Col("gravite", "severity", "severite");
        var iLot = Col("numero de lot", "lot", "lotnumber");
        var iDesc = Col("description");
        var iDetect = Col("date de detection", "detectiondate");
        var iClosed = Col("date de cloture", "closeddate", "date cloture");
        var iLine = Col("ligne de production", "ligne", "productionline");
        var iShift = Col("equipe", "shift");
        var iProduced = Col("quantite produite", "producedquantity");
        var iDefective = Col("quantite defectueuse", "defectivequantity");

        if (iTitle < 0 || iDefect < 0 || iDetect < 0)
        {
            result.Errors.Add(new HistoryIssue(ClaimsSheet, 1, "Colonnes obligatoires manquantes : Titre, Type de défaut, Date de détection."));
            return;
        }

        string? Cell(List<string> cells, int i) => i >= 0 && i < cells.Count && cells[i].Length > 0 ? cells[i] : null;
        var seenRefs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var r = 1; r < rows.Count; r++)
        {
            var cells = rows[r];
            var line = r + 1;
            if (cells.All(string.IsNullOrWhiteSpace)) continue;
            if (ImportTemplateComposer.IsExample(Cell(cells, iTitle))) continue;

            var title = Cell(cells, iTitle);
            var defect = Cell(cells, iDefect);
            if (title == null || defect == null)
            {
                result.Errors.Add(new HistoryIssue(ClaimsSheet, line, "Titre et Type de défaut sont obligatoires."));
                continue;
            }
            if (!TryDate(Cell(cells, iDetect), out var detection))
            {
                result.Errors.Add(new HistoryIssue(ClaimsSheet, line, "Date de détection invalide (format attendu : AAAA-MM-JJ ou JJ/MM/AAAA)."));
                continue;
            }
            DateTime? closed = null;
            if (Cell(cells, iClosed) != null)
            {
                if (!TryDate(Cell(cells, iClosed), out var c))
                {
                    result.Errors.Add(new HistoryIssue(ClaimsSheet, line, "Date de clôture invalide."));
                    continue;
                }
                if (c < detection)
                {
                    result.Errors.Add(new HistoryIssue(ClaimsSheet, line, "La date de clôture précède la date de détection."));
                    continue;
                }
                closed = c;
            }

            var reference = Cell(cells, iRef) ?? $"L{line}";
            if (!seenRefs.Add(reference))
            {
                result.Errors.Add(new HistoryIssue(ClaimsSheet, line, $"Référence « {reference} » en double dans le fichier."));
                continue;
            }

            var severity = Enum.TryParse<ClaimSeverity>(Cell(cells, iSev) ?? string.Empty, true, out var sev)
                ? sev
                : SeverityFromFrench(Cell(cells, iSev));

            result.Claims.Add(new HistoryClaimRow(
                line, reference, title, Cell(cells, iClient) ?? string.Empty, defect, severity.ToString(),
                Cell(cells, iLot) ?? string.Empty, Cell(cells, iDesc) ?? string.Empty,
                detection, closed, Cell(cells, iLine), Cell(cells, iShift),
                TryInt(Cell(cells, iProduced)), TryInt(Cell(cells, iDefective))));
        }
    }

    private static void ParseCauses(List<List<string>> rows, ParsedHistory result)
    {
        if (rows.Count < 2) return;
        var h = rows[0];
        int Col(params string[] aliases) => ImportTemplateComposer.HeaderIndex(h, aliases);
        var iRef = Col("reference", "ref", "id");
        var iCat = Col("categorie 6m", "categorie", "category", "6m");
        var iDesc = Col("description de la cause", "description", "cause");
        var iRoot = Col("cause racine (oui/non)", "cause racine", "isrootcause", "racine");

        if (iRef < 0 || iCat < 0 || iDesc < 0)
        {
            result.Errors.Add(new HistoryIssue(CausesSheet, 1, "Colonnes obligatoires manquantes : Référence, Catégorie 6M, Description de la cause."));
            return;
        }

        var known = result.Claims.Select(c => c.Reference).ToHashSet(StringComparer.OrdinalIgnoreCase);
        string? Cell(List<string> cells, int i) => i >= 0 && i < cells.Count && cells[i].Length > 0 ? cells[i] : null;

        for (var r = 1; r < rows.Count; r++)
        {
            var cells = rows[r];
            var line = r + 1;
            if (cells.All(string.IsNullOrWhiteSpace)) continue;
            if (ImportTemplateComposer.IsExample(Cell(cells, iDesc)) || ImportTemplateComposer.IsExample(Cell(cells, iRef))) continue;

            var reference = Cell(cells, iRef);
            var description = Cell(cells, iDesc);
            if (reference == null || description == null)
            {
                result.Errors.Add(new HistoryIssue(CausesSheet, line, "Référence et description de la cause sont obligatoires."));
                continue;
            }
            if (!known.Contains(reference))
            {
                result.Errors.Add(new HistoryIssue(CausesSheet, line, $"Aucune réclamation valide avec la référence « {reference} »."));
                continue;
            }
            if (!TryCategory(Cell(cells, iCat), out var category))
            {
                result.Errors.Add(new HistoryIssue(CausesSheet, line, "Catégorie 6M inconnue (Main-d'œuvre, Machine, Matière, Méthode, Milieu, Mesure)."));
                continue;
            }
            var root = ImportTemplateComposer.Fold(Cell(cells, iRoot) ?? "") is "oui" or "yes" or "true" or "1" or "x";
            result.Causes.Add(new HistoryCauseRow(line, reference, category, description, root));
        }
    }

    private static ClaimSeverity SeverityFromFrench(string? value) =>
        ImportTemplateComposer.Fold(value ?? "") switch
        {
            "faible" or "mineure" or "low" => ClaimSeverity.LOW,
            "moyenne" or "moyen" or "medium" => ClaimSeverity.MEDIUM,
            "critique" or "critical" => ClaimSeverity.CRITICAL,
            _ => ClaimSeverity.HIGH,
        };

    private static bool TryCategory(string? value, out IshikawaCategory category)
    {
        category = default;
        var key = ImportTemplateComposer.Fold(value ?? "").Replace("œ", "oe").Replace("’", "'");
        IshikawaCategory? found = key switch
        {
            "main-d'oeuvre" or "main d'oeuvre" or "main d’oeuvre" or "main-d’oeuvre" or "manpower" or "homme" or "personnel" => IshikawaCategory.Manpower,
            "machine" or "materiel" => IshikawaCategory.Machine,
            "matiere" or "material" => IshikawaCategory.Material,
            "methode" or "method" => IshikawaCategory.Method,
            "milieu" or "environnement" => IshikawaCategory.Milieu,
            "mesure" or "measurement" => IshikawaCategory.Measurement,
            _ => null,
        };
        if (found == null) return false;
        category = found.Value;
        return true;
    }

    private static bool TryDate(string? value, out DateTime date)
    {
        date = default;
        if (string.IsNullOrWhiteSpace(value)) return false;
        string[] formats = { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "yyyy/MM/dd", "yyyy-MM-ddTHH:mm:ss" };
        if (DateTime.TryParseExact(value.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            date = DateTime.SpecifyKind(parsed.Date, DateTimeKind.Utc);
            return true;
        }
        return false;
    }

    private static int? TryInt(string? value) =>
        int.TryParse(value?.Replace(" ", "").Replace(" ", ""), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) && n >= 0 ? n : null;
}
