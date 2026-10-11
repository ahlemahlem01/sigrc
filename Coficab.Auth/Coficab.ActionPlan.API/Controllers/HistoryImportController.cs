using System.Security.Claims;
using ClosedXML.Excel;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// Import of historical (closed) quality dossiers from an Excel workbook or CSV.
/// Every import is a batch that can be archived and restored — rows are never deleted.
/// </summary>
[ApiController]
[Authorize]
[Route("api/history-import")]
public class HistoryImportController : ControllerBase
{
    private const int MaxClaimsPerFile = 2000;
    private readonly ActionPlanDbContext _db;

    public HistoryImportController(ActionPlanDbContext db) => _db = db;

    public sealed class BatchRow
    {
        public Guid Id { get; set; }
        public string FileName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public int ClaimCount { get; set; }
        public int CauseCount { get; set; }
        public bool IsArchived { get; set; }
        public DateTime? ArchivedAt { get; set; }
    }

    [HttpGet("template")]
    public IActionResult Template()
    {
        if (!CanImportData()) return Forbid();

        using var wb = new XLWorkbook();

        var info = wb.Worksheets.Add("Instructions");
        var lines = new[]
        {
            "Import des dossiers historiques (réclamations clôturées et leurs causes)",
            "",
            "1. Feuille « Reclamations » : une ligne par dossier. Colonnes obligatoires : Titre, Type de défaut, Date de détection.",
            "2. Feuille « Causes » (facultative) : une ligne par cause, reliée au dossier par la colonne Référence.",
            "3. Les dates s'écrivent AAAA-MM-JJ ou JJ/MM/AAAA.",
            "4. Catégories 6M acceptées : Main-d'œuvre, Machine, Matière, Méthode, Milieu, Mesure.",
            "5. Gravité : Faible, Moyenne, Haute ou Critique.",
            "6. Les lignes dont le titre commence par « Exemple » sont ignorées.",
            "7. Aucune donnée n'est supprimée : un import se retire en archivant son lot.",
        };
        for (var i = 0; i < lines.Length; i++) info.Cell(i + 1, 1).Value = lines[i];
        info.Cell(1, 1).Style.Font.Bold = true;
        info.Column(1).Width = 110;

        var claims = wb.Worksheets.Add(HistoryImportParser.ClaimsSheet);
        WriteRow(claims, 1, HistoryImportParser.ClaimHeaders, bold: true);
        WriteRow(claims, 2, new[]
        {
            "EX-001", "Exemple — connecteur mal verrouillé", "Client A", "Connecteur", "Haute", "LOT-2025-014",
            "Verrouillage incomplet détecté au contrôle final", "2025-03-12", "2025-04-02", "Ligne 3", "Nuit", "12000", "36",
        });
        foreach (var c in new[] { 1, 2 }) claims.Column(c).AdjustToContents();
        claims.Columns().AdjustToContents();

        var causes = wb.Worksheets.Add(HistoryImportParser.CausesSheet);
        WriteRow(causes, 1, HistoryImportParser.CauseHeaders, bold: true);
        WriteRow(causes, 2, new[] { "EX-001", "Machine", "Exemple — dérive du réglage de la sertisseuse", "oui" });
        causes.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "modele-historique-dossiers.xlsx");
    }

    [HttpPost("preview")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> Preview(IFormFile file, CancellationToken ct)
    {
        var (parsed, duplicates, error) = await ReadAsync(file, ct);
        if (error != null) return error;

        var causeCount = parsed!.Causes.Count;
        return Ok(new
        {
            claims = parsed.Claims.Count,
            causes = causeCount,
            duplicates = duplicates!.Select(d => new { line = d.Line, title = d.Title }),
            errors = parsed.Errors,
            importable = parsed.Claims.Count - duplicates!.Count,
            sample = parsed.Claims.Take(10).Select(c => new
            {
                line = c.Line,
                reference = c.Reference,
                title = c.Title,
                defectType = c.DefectType,
                detectionDate = c.DetectionDate,
                closedDate = c.ClosedDate,
                productionLine = c.ProductionLine,
                causes = parsed.Causes.Count(x => string.Equals(x.Reference, c.Reference, StringComparison.OrdinalIgnoreCase)),
            }),
        });
    }

    [HttpPost("commit")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> Commit(IFormFile file, CancellationToken ct)
    {
        var (parsed, duplicates, error) = await ReadAsync(file, ct);
        if (error != null) return error;

        var skip = duplicates!.Select(d => d.Reference).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var rows = parsed!.Claims.Where(c => !skip.Contains(c.Reference)).ToList();
        if (rows.Count == 0)
            return BadRequest(new { message = "Aucun dossier à importer (tout est en erreur ou déjà présent)." });

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";
        var author = $"import:{userId}";
        var batchId = Guid.NewGuid();
        var idByRef = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);

        var defectTypes = await Coficab.ActionPlan.Application.ReferenceLists.DefectTypeResolver.LoadAsync(_db, ct);
        await using var tx = await BeginAsync(ct);

        foreach (var r in rows)
        {
            var id = Guid.NewGuid();
            idByRef[r.Reference] = id;
            var closed = r.ClosedDate ?? r.DetectionDate;
            _db.Claims.Add(new Coficab.ActionPlan.Core.Entities.Claim
            {
                Id = id,
                Title = r.Title,
                ClientId = r.ClientId,
                DefectType = defectTypes.Resolve(r.DefectType),
                Severity = r.Severity,
                LotNumber = r.LotNumber,
                Description = r.Description,
                StatusCode = "CLOTUREE",
                DetectionDate = r.DetectionDate,
                CompletedAt = closed,
                ProductionLine = r.ProductionLine,
                Shift = r.Shift,
                ProducedQuantity = r.ProducedQuantity,
                DefectiveQuantity = r.DefectiveQuantity,
                // No owner: historical dossiers never show up in an employee's own list.
                CreatedById = null,
                CreatedBy = author,
                CreatedAt = r.DetectionDate,
                UpdatedAt = closed,
            });
        }

        var causes = parsed.Causes.Where(c => idByRef.ContainsKey(c.Reference)).ToList();
        foreach (var c in causes)
        {
            _db.IshikawaCauses.Add(new IshikawaCause
            {
                Id = Guid.NewGuid(),
                ClaimId = idByRef[c.Reference],
                Category = c.Category,
                CauseDescription = c.Description,
                IsRootCause = c.IsRootCause,
                CreatedBy = author,
                CreatedAt = DateTime.UtcNow,
            });
        }

        var now = DateTime.UtcNow;
        _db.ImportBatches.Add(new ImportBatch
        {
            Id = batchId, Kind = "claims-history", FileName = Path.GetFileName(file.FileName), CreatedAt = now,
            CreatedBy = userId, ClaimCount = rows.Count, CauseCount = causes.Count, IsArchived = false,
        });
        foreach (var id in idByRef.Values)
            _db.ImportBatchClaims.Add(new ImportBatchClaim { BatchId = batchId, ClaimId = id });
        await _db.SaveChangesAsync(ct);

        if (tx != null) await tx.CommitAsync(ct);

        return Ok(new
        {
            batchId,
            imported = rows.Count,
            causes = causes.Count,
            skippedDuplicates = skip.Count,
            errors = parsed.Errors,
        });
    }

    [HttpGet("batches")]
    public async Task<IActionResult> Batches(CancellationToken ct)
    {
        if (!CanImportData()) return Forbid();
        var rows = await _db.ImportBatches.AsNoTracking()
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new BatchRow
            {
                Id = b.Id, FileName = b.FileName, CreatedAt = b.CreatedAt, CreatedBy = b.CreatedBy, ClaimCount = b.ClaimCount,
                CauseCount = b.CauseCount, IsArchived = b.IsArchived, ArchivedAt = b.ArchivedAt,
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    [HttpPost("batches/{id:guid}/archive")]
    public Task<IActionResult> Archive(Guid id, CancellationToken ct) => SetArchived(id, true, ct);

    [HttpPost("batches/{id:guid}/restore")]
    public Task<IActionResult> Restore(Guid id, CancellationToken ct) => SetArchived(id, false, ct);

    private async Task<IActionResult> SetArchived(Guid id, bool archived, CancellationToken ct)
    {
        if (!CanImportData()) return Forbid();
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";
        var now = DateTime.UtcNow;

        await using var tx = await BeginAsync(ct);
        var batch = await _db.ImportBatches.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (batch == null) return NotFound(new { message = "Lot introuvable." });
        batch.IsArchived = archived;
        batch.ArchivedAt = archived ? now : null;

        var claimIds = await _db.ImportBatchClaims.Where(x => x.BatchId == id).Select(x => x.ClaimId).ToListAsync(ct);
        // IgnoreQueryFilters: archived rows must stay reachable so the batch can be restored.
        var claims = await _db.Claims.IgnoreQueryFilters().Where(c => claimIds.Contains(c.Id)).ToListAsync(ct);
        foreach (var c in claims) c.IsArchived = archived;
        var causes = await _db.IshikawaCauses.IgnoreQueryFilters().Where(c => claimIds.Contains(c.ClaimId)).ToListAsync(ct);
        foreach (var c in causes)
        {
            c.IsArchived = archived;
            c.ArchivedAt = archived ? now : null;
            c.ArchivedBy = archived ? userId : null;
            c.ArchiveReason = archived ? "Lot d'import archivé" : null;
        }
        await _db.SaveChangesAsync(ct);
        if (tx != null) await tx.CommitAsync(ct);

        return Ok(new { id, archived });
    }

    /// <summary>Transactions only exist on a relational database (the in-memory test database has none).</summary>
    private async Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction?> BeginAsync(CancellationToken ct) =>
        _db.Database.IsRelational() ? await _db.Database.BeginTransactionAsync(ct) : null;

    private sealed record Duplicate(int Line, string Reference, string Title);

    private async Task<(ParsedHistory? parsed, List<Duplicate>? duplicates, IActionResult? error)> ReadAsync(IFormFile? file, CancellationToken ct)
    {
        if (!CanImportData()) return (null, null, Forbid());
        if (file == null || file.Length == 0)
            return (null, null, BadRequest(new { message = "Fichier requis (Excel .xlsx ou CSV)." }));

        await using var stream = file.OpenReadStream();
        var parsed = HistoryImportParser.Parse(stream, file.FileName);
        if (parsed.Claims.Count > MaxClaimsPerFile)
            return (null, null, BadRequest(new { message = $"Maximum {MaxClaimsPerFile} dossiers par fichier." }));

        var duplicates = new List<Duplicate>();
        if (parsed.Claims.Count > 0)
        {
            var titles = parsed.Claims.Select(c => c.Title).Distinct().ToList();
            var existing = await _db.Claims.AsNoTracking()
                .Where(c => titles.Contains(c.Title))
                .Select(c => new { c.Title, c.LotNumber, c.DetectionDate })
                .ToListAsync(ct);
            var keys = existing
                .Select(e => Key(e.Title, e.LotNumber, e.DetectionDate))
                .ToHashSet();
            foreach (var c in parsed.Claims)
                if (keys.Contains(Key(c.Title, c.LotNumber, c.DetectionDate)))
                    duplicates.Add(new Duplicate(c.Line, c.Reference, c.Title));
        }
        return (parsed, duplicates, null);
    }

    private static string Key(string title, string lot, DateTime date) =>
        $"{ImportTemplateComposer.Fold(title)}|{ImportTemplateComposer.Fold(lot ?? string.Empty)}|{date:yyyy-MM-dd}";

    private static void WriteRow(IXLWorksheet sheet, int row, IEnumerable<string> values, bool bold = false)
    {
        var col = 1;
        foreach (var v in values)
        {
            var cell = sheet.Cell(row, col++);
            cell.Value = v;
            if (bold)
            {
                cell.Style.Font.Bold = true;
                cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#E8ECF8");
            }
        }
    }

    private bool CanImportData()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();
        if (roles.Contains("admin") || roles.Contains("superadmin")) return true;
        return User.FindAll("permission")
            .Any(c => string.Equals(c.Value, "data:import", StringComparison.OrdinalIgnoreCase));
    }
}
