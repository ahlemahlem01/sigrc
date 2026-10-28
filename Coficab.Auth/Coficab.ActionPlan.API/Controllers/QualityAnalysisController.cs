using Coficab.ActionPlan.Application.QualityAnalyses;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.Claims.Commands.StartClaimAnalysis;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;
using Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Analytics;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Claims;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.FiveWhy;
using Coficab.ActionPlan.Application.QualityAnalyses.Queries.Ishikawa;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Application.Workflow;
using Coficab.ActionPlan.Core.DTOs.ActionPlan;
using Coficab.ActionPlan.Core.DTOs.Claims;
using Coficab.ActionPlan.Core.DTOs.PlanAction;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class QualityAnalysisController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IQualityReportPdfService _pdfService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IActionPlanService _actionPlanService;
    private readonly IApplicationDbContext _db;
    private readonly INotificationService _notificationService;
    private readonly ISemanticSearchService _semanticSearch;
    private readonly Coficab.ActionPlan.API.Services.D4ChainService _d4Chain;
    private readonly IClaimWorkflow _workflow;

    public QualityAnalysisController(
        IMediator mediator,
        IQualityReportPdfService pdfService,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IActionPlanService actionPlanService,
        IApplicationDbContext db,
        INotificationService notificationService,
        ISemanticSearchService semanticSearch,
        Coficab.ActionPlan.API.Services.D4ChainService d4Chain,
        IClaimWorkflow workflow)
    {
        _workflow = workflow;
        _mediator = mediator;
        _pdfService = pdfService;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _actionPlanService = actionPlanService;
        _db = db;
        _notificationService = notificationService;
        _semanticSearch = semanticSearch;
        _d4Chain = d4Chain;
    }

    // ─── CLAIMS ENDPOINTS ──────────────────────────────────────────────────

    /// <summary>
    /// Recherche sémantique (embeddings Gemini + similarité cosinus) sur claims et CAPA.
    /// </summary>
    [HttpGet("semantic-search")]
    public async Task<IActionResult> SemanticSearch(
        [FromQuery] string q,
        [FromQuery] int top = 25,
        CancellationToken cancellationToken = default)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié." });

        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { message = "Le paramètre q est requis." });

        try
        {
            var result = await _semanticSearch.SearchAsync(
                q.Trim(),
                top,
                scopeUserId: userId,
                adminScope: IsQualityAdmin(),
                cancellationToken);

            // Hydrate claim entities for the directory UI (same shape as GetClaims).
            var claimIds = result.Claims.Select(c => c.EntityId).ToList();
            var claims = claimIds.Count == 0
                ? new List<Core.Entities.Claim>()
                : await _db.Claims.AsNoTracking()
                    .Where(c => claimIds.Contains(c.Id))
                    .ToListAsync(cancellationToken);

            var scoreById = result.Claims.ToDictionary(c => c.EntityId, c => c.Score);
            var orderedClaims = claims
                .OrderByDescending(c => scoreById.GetValueOrDefault(c.Id))
                .Select(c => new
                {
                    c.Id,
                    c.Title,
                    c.ClientId,
                    c.DefectType,
                    c.Severity,
                    c.LotNumber,
                    c.SerialNumber,
                    c.Description,
                    c.StatusCode,
                    c.AssignedToId,
                    c.AssignedToName,
                    c.AssignedAt,
                    c.Deadline,
                    c.CompletedAt,
                    c.IsOnTime,
                    c.DetectionDate,
                    c.CreatedById,
                    c.CreatedBy,
                    c.CreatedAt,
                    c.UpdatedAt,
                    c.ProductionLine,
                    c.Shift,
                    c.AnalysisNotes,
                    c.ProducedQuantity,
                    c.DefectiveQuantity,
                    c.AttachmentName,
                    score = scoreById.GetValueOrDefault(c.Id),
                })
                .ToList();

            return Ok(new
            {
                query = result.Query,
                claims = orderedClaims,
                actionPlans = result.ActionPlans,
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(502, new { message = ex.Message });
        }
    }

    [HttpGet("claims")]
    public async Task<IActionResult> GetClaims(
        [FromQuery] string? status,
        [FromQuery] string? assignedTo,
        [FromQuery] string? createdBy,
        [FromQuery] string? relatedTo,
        [FromQuery] bool? hasAssignee,
        CancellationToken cancellationToken,
        [FromQuery] string? organizationIds = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = GetClaimsPageQuery.DefaultPageSize,
        [FromQuery] bool archived = false)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié." });

        var isAdmin = IsQualityAdmin();
        if (archived && !isAdmin) return Forbid();
        string? relatedToUserId = null;
        string? assignedToId = null;
        string? createdById = null;
        bool? effectiveHasAssignee = hasAssignee;
        var excludeSelfCreated = false;

        if (!isAdmin)
        {
            // Employé : scopes stricts — créées / assignées (par admin) / les deux.
            var wantsCreated = !string.IsNullOrWhiteSpace(ResolveMe(createdBy, userId))
                || string.Equals(createdBy?.Trim(), "me", StringComparison.OrdinalIgnoreCase);
            var wantsAssigned = !string.IsNullOrWhiteSpace(ResolveMe(assignedTo, userId))
                || string.Equals(assignedTo?.Trim(), "me", StringComparison.OrdinalIgnoreCase);
            var wantsRelated = !string.IsNullOrWhiteSpace(ResolveMe(relatedTo, userId))
                || string.Equals(relatedTo?.Trim(), "me", StringComparison.OrdinalIgnoreCase);

            if (wantsCreated && !wantsAssigned)
            {
                // « Créées par moi » = créées par l'employé ET assignées à lui (ses dossiers).
                createdById = userId;
                assignedToId = userId;
            }
            else if (wantsAssigned && !wantsCreated)
            {
                assignedToId = userId;
                excludeSelfCreated = true;
            }
            else
            {
                relatedToUserId = userId;
            }

            if (hasAssignee == false && createdById == null)
                effectiveHasAssignee = null;
        }
        else
        {
            relatedToUserId = ResolveMe(relatedTo, userId);
            assignedToId = ResolveMe(assignedTo, userId);
            createdById = ResolveMe(createdBy, userId);
        }

        // Pagination is mandatory: the body stays the plain list (same shape as before), the totals travel in headers.
        var result = await _mediator.Send(
            new GetClaimsPageQuery(
                new GetClaimsQuery(status, assignedToId, createdById, effectiveHasAssignee, relatedToUserId, excludeSelfCreated,
                    IsQualityAdmin() && !IsSuperAdmin() ? userId : null,
                    isAdmin ? ClaimOrganizations.Parse(organizationIds) : null,
                    archived),
                page,
                pageSize),
            cancellationToken);
        Response.Headers["X-Total-Count"] = result.Total.ToString();
        Response.Headers["X-Page"] = result.Page.ToString();
        Response.Headers["X-Page-Size"] = result.PageSize.ToString();
        return Ok(result.Items);
    }

    /// <summary>Administrators: hides a claim from every list (it stays in the database). Refused while its CAPA plan is open.</summary>
    [HttpPost("claims/{id:guid}/archive")]
    public Task<IActionResult> ArchiveClaim(Guid id, CancellationToken cancellationToken) => SetArchivedAsync(id, true, cancellationToken);

    /// <summary>Administrators: brings an archived claim back.</summary>
    [HttpPost("claims/{id:guid}/restore")]
    public Task<IActionResult> RestoreClaim(Guid id, CancellationToken cancellationToken) => SetArchivedAsync(id, false, cancellationToken);

    private async Task<IActionResult> SetArchivedAsync(Guid id, bool archive, CancellationToken cancellationToken)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié." });
        if (!IsQualityAdmin()) return Forbid();

        var result = await _mediator.Send(new ArchiveClaimCommand(id, archive, userId), cancellationToken);
        return result switch
        {
            ArchiveClaimResult.Done => Ok(new { success = true, message = archive ? "Réclamation archivée." : "Réclamation restaurée." }),
            ArchiveClaimResult.Unchanged => Ok(new { success = true, message = archive ? "Déjà archivée." : "Déjà active." }),
            ArchiveClaimResult.HasOpenPlans => Conflict(new { message = "Cette réclamation a un plan d'action encore ouvert : clôturez-le d'abord." }),
            _ => NotFound(new { message = "Réclamation introuvable." }),
        };
    }

    /// <summary>The audit log of claims: recorded events, 8D history and imports (quality admins).</summary>
    [HttpGet("claims/events")]
    public async Task<IActionResult> GetClaimsAuditEvents([FromQuery] string? organizationIds, CancellationToken cancellationToken)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié." });
        if (!IsQualityAdmin()) return Forbid();

        var query = IsSuperAdmin()
            ? new GetClaimsAuditQuery(organizationIds)
            : new GetClaimsAuditQuery(null, userId);
        return Ok(await _mediator.Send(query, cancellationToken));
    }

    [HttpGet("claims/history")]
    public async Task<IActionResult> GetClaimsHistory(
        [FromQuery] GetClaimsHistoryQuery query,
        CancellationToken cancellationToken)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié." });

        if (!IsQualityAdmin())
        {
            query.RelatedToUserId = userId;
            query.OrganizationIds = null;
        }
        else if (!IsSuperAdmin())
        {
            query.ScopeUserId = userId;
            query.OrganizationIds = null;
        }

        var result = await _mediator.Send(query, cancellationToken);
        return Ok(result);
    }

    [HttpGet("claims/resolution-estimate")]
    public async Task<IActionResult> EstimateClaimResolution(
        [FromQuery] string? defectType,
        [FromQuery] string? severity,
        CancellationToken cancellationToken)
    {
        var result = await _mediator.Send(
            new EstimateClaimResolutionQuery(defectType, severity),
            cancellationToken);
        if (result == null)
            return Ok(new { available = false, message = "Aucun historique de clôture disponible." });

        return Ok(new
        {
            available = true,
            daysP50 = result.DaysP50,
            daysP80 = result.DaysP80,
            sampleSize = result.SampleSize,
            method = result.Method,
            defectType = result.DefectType,
            severity = result.Severity,
            suggestedDeadlineUtc = result.SuggestedDeadlineUtc,
            isReliable = result.IsReliable
        });
    }

    [HttpGet("claims/{id:guid}")]
    public async Task<IActionResult> GetClaimById(Guid id, CancellationToken cancellationToken)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié." });

        var result = await _mediator.Send(new GetClaimByIdQuery(id), cancellationToken);
        if (result == null)
            return NotFound(new { message = "Réclamation introuvable." });

        if (IsSuperAdmin())
        {
            /* toutes les réclamations */
        }
        else if (IsQualityAdmin())
        {
            var visible = await ClaimVisibility.ApplyAsync(_db, _db.Claims.AsNoTracking().Where(c => c.Id == id), userId, cancellationToken);
            if (!await visible.AnyAsync(cancellationToken))
                return Forbid();
        }
        else if (!await UserCanAccessClaimAsync(id, userId, cancellationToken))
            return Forbid();

        return Ok(result);
    }

    /// <summary>
    /// Defect code proposed for a photo of the damaged cable. The image model is a separate service (ComputerVision:ServiceUrl,
    /// POST {url}/predict with the image, answering { defectType, confidence }). While none is configured the answer is
    /// { available: false } and the form simply offers nothing: the operator picks the code himself.
    /// ComputerVision:Mode = "demo" answers a fixed example flagged demo: true (see CvDemoPrediction), to show the card without the service.
    /// </summary>
    [HttpPost("claims/cv-suggestion")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> SuggestDefectFromImage(IFormFile image, CancellationToken cancellationToken)
    {
        if (image is not { Length: > 0 }) return Ok(new { available = false, reason = "noImage" });
        if (string.Equals(_configuration["ComputerVision:Mode"], "demo", StringComparison.OrdinalIgnoreCase))
        {
            var (demoCode, demoConfidence) = Coficab.ActionPlan.Application.QualityAnalyses.Services.CvDemoPrediction.For(image.FileName);
            return Ok(new { available = true, demo = true, defectType = demoCode, confidence = demoConfidence,
                            threshold = Coficab.ActionPlan.Application.QualityAnalyses.Services.CvFeedback.ConfidenceThreshold });
        }
        var url = _configuration["ComputerVision:ServiceUrl"];
        if (string.IsNullOrWhiteSpace(url)) return Ok(new { available = false, reason = "notConfigured" });
        try
        {
            using var content = new MultipartFormDataContent();
            await using var stream = image.OpenReadStream();
            content.Add(new StreamContent(stream), "file", image.FileName);
            var http = _httpClientFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(10);
            // ServiceUrl is the service address; the full endpoint ("http://host:5000/predict") is accepted too
            var endpoint = url.TrimEnd('/');
            if (!endpoint.EndsWith("/predict", StringComparison.OrdinalIgnoreCase)) endpoint += "/predict";
            using var response = await http.PostAsync(endpoint, content, cancellationToken);
            if (!response.IsSuccessStatusCode) return Ok(new { available = false, reason = "unavailable" });
            var body = await response.Content.ReadFromJsonAsync<CvPredictionBody>(cancellationToken: cancellationToken);
            if (body is null) return Ok(new { available = false, reason = "unavailable" });
            var similar_cases = body.SimilarCases ?? [];
            // a defect that is seen but not named: no code to propose, the form only tells the operator to look
            if (string.IsNullOrWhiteSpace(body.DefectType))
                return Ok(body.AnomalyDetected == true ? new { available = false, reason = "anomaly", anomalyDetected = true, confidence = Math.Clamp(body.Confidence, 0, 1), similar_cases } : new { available = false, reason = "noDefect", anomalyDetected = false, confidence = 0.0, similar_cases });
            var resolver = await Coficab.ActionPlan.Application.ReferenceLists.DefectTypeResolver.LoadAsync(_db, cancellationToken);
            return Ok(new { available = true, defectType = resolver.Resolve(body.DefectType.Trim()), confidence = Math.Clamp(body.Confidence, 0, 1),
                            lineFamilies = body.LineFamilies ?? [], lines = body.Lines ?? [], similar_cases,
                            threshold = Coficab.ActionPlan.Application.QualityAnalyses.Services.CvFeedback.ConfidenceThreshold });
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return Ok(new { available = false, reason = "unavailable" });
        }
    }

    private sealed record CvPredictionBody(string? DefectType, double Confidence, string[]? LineFamilies = null, string[]? Lines = null, bool? AnomalyDetected = null,
        [property: System.Text.Json.Serialization.JsonPropertyName("similar_cases")] List<SimilarCaseBody>? SimilarCases = null);

    /// <summary>A past case that looks like the photo (the image service decides which; the names are the ones of its contract).</summary>
    private sealed record SimilarCaseBody(
        [property: System.Text.Json.Serialization.JsonPropertyName("id_reclamation")] string? IdReclamation,
        [property: System.Text.Json.Serialization.JsonPropertyName("photo_url")] string? PhotoUrl,
        [property: System.Text.Json.Serialization.JsonPropertyName("code_defaut")] string? CodeDefaut,
        [property: System.Text.Json.Serialization.JsonPropertyName("libelle_defaut")] string? LibelleDefaut,
        [property: System.Text.Json.Serialization.JsonPropertyName("score_similarite")] double ScoreSimilarite,
        [property: System.Text.Json.Serialization.JsonPropertyName("source")] string? Source,
        [property: System.Text.Json.Serialization.JsonPropertyName("reference")] string? Reference,
        [property: System.Text.Json.Serialization.JsonPropertyName("severite")] string? Severite);

    [HttpPost("claims")]
    [Consumes("multipart/form-data")] // Indique à Swagger / OpenApi qu'il s'agit d'un upload de fichier
    public async Task<IActionResult> CreateClaim([FromForm] CreateClaimCommand command, CancellationToken cancellationToken)
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdString, out var userId))
            return Unauthorized(new { message = "Invalid user claim token." });

        // L'attribut [JsonIgnore] empêche l'injection par le client
        command.CreatedById = userId;

        var claimId = await _mediator.Send(command, cancellationToken);
        return Ok(new { id = claimId, message = "Claim created successfully." });
    }

    /// <summary>
    /// Import CSV de réclamations. Admin et superadmin y ont toujours accès.
    /// Un employé doit posséder la permission data:import.
    /// Colonnes : Title, ClientId, DefectType, Severity, LotNumber, Description, DetectionDate (optionnelle).
    /// </summary>
    [HttpPost("claims/import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> ImportClaims(IFormFile file, CancellationToken cancellationToken)
    {
        if (!CanImportData())
            return Forbid();

        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdString, out var userId))
            return Unauthorized(new { message = "Invalid user claim token." });

        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Fichier CSV requis." });

        string text;
        using (var reader = new StreamReader(file.OpenReadStream()))
            text = await reader.ReadToEndAsync(cancellationToken);

        var rows = ParseClaimCsv(text);
        if (rows.Count == 0)
            return BadRequest(new { message = "Aucune ligne à importer. En-tête attendu : Titre, Client, Type de défaut, Gravité, Numéro de lot, Description." });
        if (rows.Count > 300)
            return BadRequest(new { message = "Maximum 300 réclamations par fichier." });

        var created = new List<Guid>();
        var errors = new List<object>();
        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            if (string.IsNullOrWhiteSpace(row.Title) || string.IsNullOrWhiteSpace(row.DefectType))
            {
                errors.Add(new { line = i + 2, message = "Title et DefectType sont requis." });
                continue;
            }

            if (!Enum.TryParse<ClaimSeverity>(row.Severity, true, out var severity))
                severity = ClaimSeverity.HIGH;

            var detection = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(row.DetectionDate) && DateTime.TryParse(row.DetectionDate, out var parsed))
                detection = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);

            try
            {
                var id = await _mediator.Send(new CreateClaimCommand
                {
                    Title = row.Title.Trim(),
                    ClientId = row.ClientId?.Trim() ?? string.Empty,
                    DefectType = row.DefectType.Trim(),
                    Severity = severity,
                    LotNumber = row.LotNumber?.Trim() ?? string.Empty,
                    Description = row.Description?.Trim() ?? string.Empty,
                    DetectionDate = detection,
                    CreatedById = userId
                }, cancellationToken);
                created.Add(id);
            }
            catch (Exception ex)
            {
                errors.Add(new { line = i + 2, message = ex.Message });
            }
        }

        return Ok(new { created = created.Count, ids = created, errors });
    }

    private sealed record CsvClaimRow(string Title, string? ClientId, string DefectType, string? Severity, string? LotNumber, string? Description, string? DetectionDate);

    private static List<CsvClaimRow> ParseClaimCsv(string text)
    {
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length < 2) return [];

        var delimiter = lines[0].Contains(';') && !lines[0].Contains(',') ? ';' : ',';
        var header = SplitCsvLine(lines[0], delimiter)
            .Select(h => h.Trim().Trim('"').ToLowerInvariant())
            .ToList();
        var iTitle = ImportTemplateComposer.HeaderIndex(header, "title", "titre");
        var iClient = ImportTemplateComposer.HeaderIndex(header, "clientid", "client");
        var iDefect = ImportTemplateComposer.HeaderIndex(header, "defecttype", "type de defaut");
        var iSev = ImportTemplateComposer.HeaderIndex(header, "severity", "gravite", "severite");
        var iLot = ImportTemplateComposer.HeaderIndex(header, "lotnumber", "numero de lot");
        var iDesc = ImportTemplateComposer.HeaderIndex(header, "description");
        var iDate = ImportTemplateComposer.HeaderIndex(header, "detectiondate", "date de detection");
        if (iTitle < 0 || iDefect < 0) return [];

        string? Cell(IReadOnlyList<string> cells, int index) =>
            index >= 0 && index < cells.Count ? cells[index] : null;

        var rows = new List<CsvClaimRow>();
        for (var i = 1; i < lines.Length; i++)
        {
            var cells = SplitCsvLine(lines[i], delimiter);
            if (cells.All(string.IsNullOrWhiteSpace)) continue;
            if (ImportTemplateComposer.IsExample(Cell(cells, iTitle))) continue;
            rows.Add(new CsvClaimRow(
                Cell(cells, iTitle) ?? "",
                Cell(cells, iClient),
                Cell(cells, iDefect) ?? "",
                Cell(cells, iSev),
                Cell(cells, iLot),
                Cell(cells, iDesc),
                Cell(cells, iDate)));
        }
        return rows;
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

    [HttpPut("claims/{id:guid}")]
    public async Task<IActionResult> UpdateClaim(Guid id, [FromBody] UpdateClaimCommand command, CancellationToken cancellationToken)
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdString, out var userId))
            return Unauthorized(new { message = "Invalid user claim token." });

        command.Id = id;
        command.UpdatedById = userId;

        if (!string.IsNullOrWhiteSpace(command.StatusCode))
        {
            var blocked = await WorkflowBlockAsync(id, command.StatusCode, cancellationToken);
            if (blocked != null) return blocked;
        }

        var success = await _mediator.Send(command, cancellationToken);
        if (!success)
            return NotFound(new { message = "Réclamation introuvable." });

        return Ok(new { success, message = "Réclamation mise à jour avec succès." });
    }

    public sealed class SetClaimDeadlineRequest
    {
        public DateTime? Deadline { get; set; }
    }

    [HttpPatch("claims/{id:guid}/deadline")]
    public async Task<IActionResult> SetClaimDeadline(
        Guid id,
        [FromBody] SetClaimDeadlineRequest body,
        CancellationToken cancellationToken)
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdString, out var userId))
            return Unauthorized(new { message = "Invalid user claim token." });

        if (body?.Deadline == null)
            return BadRequest(new { message = "Deadline est requise." });

        var success = await _mediator.Send(
            new SetClaimDeadlineCommand(id, body.Deadline.Value, userId),
            cancellationToken);
        if (!success)
            return NotFound(new { message = "Réclamation introuvable." });

        return Ok(new
        {
            success = true,
            message = "Date limite appliquée.",
            deadline = body.Deadline.Value.Date
        });
    }

    public sealed class AssignClaimRequest
    {
        public string? AssignedToId { get; set; }
        public string? AssignedToName { get; set; }
    }

    [HttpPatch("claims/{id:guid}/assign")]
    public async Task<IActionResult> AssignClaim(
        Guid id,
        [FromBody] AssignClaimRequest body,
        CancellationToken cancellationToken)
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdString, out var userId))
            return Unauthorized(new { message = "Invalid user claim token." });

        if (!IsQualityAdmin())
            return Forbid();

        // The status only moves while the claim is still in an early state (see AssignClaimCommand).
        var assigning = !string.IsNullOrWhiteSpace(body?.AssignedToId);
        var current = await CurrentClaimStatusAsync(id, cancellationToken);
        if (assigning && current is "DRAFT" or "OUVERTE" or "OPEN")
        {
            var blocked = await WorkflowBlockAsync(id, "ASSIGNED", cancellationToken);
            if (blocked != null) return blocked;
        }
        else if (!assigning && current == "ASSIGNED")
        {
            var blocked = await WorkflowBlockAsync(id, "OUVERTE", cancellationToken);
            if (blocked != null) return blocked;
        }

        var success = await _mediator.Send(
            new AssignClaimCommand(id, body?.AssignedToId, body?.AssignedToName, userId),
            cancellationToken);
        if (!success)
            return NotFound(new { message = "Réclamation introuvable." });

        return Ok(new { success = true, message = "Réclamation assignée." });
    }

    // ─── 5 WHY ENDPOINTS ──────────────────────────────────────────────────

    [HttpGet("5why/{claimId:guid}")]
    public async Task<IActionResult> GetFiveWhy(Guid claimId, CancellationToken cancellationToken)
    {
        var result = await _mediator.Send(new GetFiveWhyByClaimIdQuery(claimId), cancellationToken);
        if (result == null)
            return NotFound(new { message = "Aucune analyse 5 Why trouvée pour cette réclamation." });

        return Ok(result);
    }

    [HttpPost("5why")]
    public async Task<IActionResult> SaveFiveWhy([FromBody] CreateOrUpdateFiveWhyCommand command, CancellationToken cancellationToken)
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (Guid.TryParse(userIdString, out var userId)) command.UserId = userId;

        // The 5 Why comes last: with answers to save, Ishikawa causes and a priority cause must exist first
        // (a dossier whose 5 Why is already under way is never locked back).
        if (command.Steps.Any(s => !string.IsNullOrWhiteSpace(s.Answer)) || !string.IsNullOrWhiteSpace(command.RootCause))
        {
            var order = await _d4Chain.EvaluateAsync(command.ClaimId, cancellationToken);
            if (!order.Tools.FiveWhy.Open)
            {
                return Conflict(new
                {
                    message = "Le 5 Why vient après l'Ishikawa et le choix de la cause prioritaire : terminez d'abord ces étapes.",
                    tool = "fiveWhy",
                    reason = order.Tools.FiveWhy.Reason
                });
            }
        }

        // D4 chain: a 5 Why is only sent for validation once a priority cause was chosen and the Ishikawa holds a
        // confirmed root cause. Dossiers already submitted/validated or closed are exempt; an admin can release one.
        if (string.Equals(command.StatusCode, "PENDING_VALIDATION", StringComparison.OrdinalIgnoreCase))
        {
            var chain = await _d4Chain.EvaluateAsync(command.ClaimId, cancellationToken);
            if (!chain.Satisfied)
            {
                return Conflict(new
                {
                    message = "Avant d'envoyer le 5 Why pour validation : choisissez la cause prioritaire et confirmez une cause racine dans l'Ishikawa.",
                    missing = chain.Missing
                });
            }
        }

        Guid resultId;
        try
        {
            resultId = await _mediator.Send(command, cancellationToken);
        }
        catch (Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy.FiveWhySaveValidationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        string successText = command.StatusCode?.ToUpper() == "PENDING_VALIDATION"
            ? "Analyse 5 Why soumise pour validation."
            : "Analyse 5 Why enregistrée en brouillon.";

        return Ok(new { id = resultId, message = successText });
    }

    [HttpPost("5why/validate")]
    public async Task<IActionResult> ValidateFiveWhy([FromBody] ValidateFiveWhyCommand command, CancellationToken cancellationToken)
    {
        var userName = User.FindFirstValue(ClaimTypes.Name)
                    ?? User.FindFirstValue("preferred_username")
                    ?? "System";

        // Same D4 chain rule as on save: no way around it by calling the status endpoint directly.
        if (command.IsApproved || string.Equals(command.StatusCode, "PENDING_VALIDATION", StringComparison.OrdinalIgnoreCase))
        {
            var chainClaimId = command.ClaimId;
            if (chainClaimId == Guid.Empty)
                chainClaimId = await _db.FiveWhyAnalyses.Where(a => a.Id == command.AnalysisId)
                    .Select(a => a.ClaimId).FirstOrDefaultAsync(cancellationToken);
            if (chainClaimId != Guid.Empty)
            {
                var chain = await _d4Chain.EvaluateAsync(chainClaimId, cancellationToken);
                if (!chain.Satisfied)
                    return Conflict(new
                    {
                        message = "Avant de valider le 5 Why : choisissez la cause prioritaire et confirmez une cause racine dans l'Ishikawa (ou débloquez avec un motif).",
                        missing = chain.Missing
                    });
            }
        }

        command.ValidatedBy = userName;
        var success = await _mediator.Send(command, cancellationToken);
        if (!success) return NotFound(new { message = "Analyse 5 Why introuvable." });

        return Ok(new { success, message = "Statut 5-Why mis à jour." });
    }

    /// <summary>
    /// Génère automatiquement la synthèse et la cause racine de l'analyse 5 Why en utilisant Google Gemini.
    /// </summary>
    [HttpPost("5why/{claimId:guid}/generate-synthesis")]
    public async Task<IActionResult> GenerateSynthesis(
        [FromRoute] Guid claimId,
        [FromBody] GenerateSynthesisRequestDto dto)
    {
        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-3.6-flash";

        if (string.IsNullOrEmpty(apiKey))
        {
            return StatusCode(500, new { message = "La clé d'API Gemini n'est pas configurée dans appsettings.json." });
        }

        var promptText = $@"Tu es un expert en Analyse Qualité Automobile (méthode 8D) chez Coficab.
Voici les données d'analyse pour la réclamation ID: {claimId}
- Titre/Problème : {dto.ClaimTitle ?? "Non spécifié"}
- Description : {dto.DefectDescription ?? "Non spécifiée"}

Analyse 5-Why réalisée par le technicien :
1. Pourquoi ? {dto.Why1}
2. Pourquoi ? {dto.Why2}
3. Pourquoi ? {dto.Why3}
4. Pourquoi ? {dto.Why4}
5. Pourquoi ? {dto.Why5}

Rédige une synthèse détaillée pour le champ 'Cause Racine & Synthèse' du rapport 8D. Elle doit couvrir, en un seul paragraphe continu (pas de liste à puces) :
1. Un résumé de l'enchaînement des causes, de la cause immédiate jusqu'à la cause racine (en t'appuyant explicitement sur les réponses Why 1 à 5).
2. L'énoncé clair de la cause racine confirmée.
3. Une recommandation d'action corrective globale cohérente avec cette cause racine.

Vise environ 5 à 8 phrases, dans un style professionnel et directement exploitable dans un rapport qualité.

RÈGLES DE SORTIE STRICTES :
- Réponds UNIQUEMENT avec le texte final de la synthèse, rien d'autre.
- N'ajoute aucune phrase d'introduction du type ""Voici la synthèse..."".
- N'utilise aucun markdown (pas de **gras**, pas de titres, pas de listes à puces).
- N'ajoute pas de guillemets autour du texte.
- Écris en texte brut, en français, prêt à être collé tel quel dans le champ.";

        var requestPayload = new
        {
            contents = new[]
            {
                new
                {
                    parts = new[]
                    {
                        new { text = promptText }
                    }
                }
            },
            generationConfig = new
            {
                temperature = 0.3,
                maxOutputTokens = 2048,
                thinkingConfig = new
                {
                    // Gemini 3.x Flash models don't support fully disabling
                    // thinking; "low" minimizes reasoning tokens spent before
                    // the visible answer, leaving more budget for the actual
                    // synthesis text so it doesn't get cut off mid-sentence.
                    thinkingLevel = "low"
                }
            }
        };

        var httpClient = _httpClientFactory.CreateClient();
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsync(
                endpoint,
                new StringContent(JsonSerializer.Serialize(requestPayload), Encoding.UTF8, "application/json")
            );
        }
        catch (HttpRequestException ex)
        {
            // Network-level failure reaching Gemini (DNS, timeout, connectivity...)
            return StatusCode(502, new { message = $"Impossible de contacter le service IA : {ex.Message}" });
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorDetails = await response.Content.ReadAsStringAsync();
            return StatusCode((int)response.StatusCode, new { message = $"Erreur lors de la génération IA: {errorDetails}" });
        }

        var responseJson = await response.Content.ReadAsStringAsync();

        string? rootCauseText;
        try
        {
            using var doc = JsonDocument.Parse(responseJson);
            var root = doc.RootElement;

            // Gemini can return a 200 with no "candidates" at all (e.g. the
            // prompt or response was blocked by safety filters) — that would
            // otherwise throw KeyNotFoundException-style errors from GetProperty.
            if (!root.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            {
                var blockReason = root.TryGetProperty("promptFeedback", out var feedback) &&
                                   feedback.TryGetProperty("blockReason", out var reason)
                    ? reason.GetString()
                    : null;

                return StatusCode(502, new
                {
                    message = blockReason != null
                        ? $"La génération IA a été bloquée par les filtres de sécurité ({blockReason})."
                        : "La génération IA n'a retourné aucun résultat exploitable."
                });
            }

            var firstCandidate = candidates[0];

            if (!firstCandidate.TryGetProperty("content", out var content) ||
                !content.TryGetProperty("parts", out var parts) ||
                parts.GetArrayLength() == 0 ||
                !parts[0].TryGetProperty("text", out var textElement))
            {
                return StatusCode(502, new { message = "Réponse IA dans un format inattendu." });
            }

            rootCauseText = textElement.GetString();
        }
        catch (JsonException ex)
        {
            return StatusCode(502, new { message = $"Réponse IA illisible : {ex.Message}" });
        }

        return Ok(new { rootCauseSynthesis = CleanSynthesisText(rootCauseText ?? string.Empty) });
    }

    /// <summary>
    /// Coach 5 Why : valide sémantiquement une réponse avant de débloquer le Pourquoi suivant.
    /// Combine Gemini (si configuré) et un garde-fou IATF local (erreur humaine = BLOCK).
    /// </summary>
    [HttpPost("5why/{claimId:guid}/validate-step")]
    public async Task<IActionResult> ValidateFiveWhyStep(
        [FromRoute] Guid claimId,
        [FromBody] ValidateFiveWhyStepRequestDto dto)
    {
        if (dto == null)
            return BadRequest(new { message = "Corps de requête manquant." });

        if (string.IsNullOrWhiteSpace(dto.ProposedAnswer))
            return Ok(FiveWhyCoachRules.EvaluateLocally(dto));

        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-2.0-flash";

        ValidateFiveWhyStepResponseDto? aiResult = null;

        if (!string.IsNullOrEmpty(apiKey))
        {
            try
            {
                aiResult = await AskGeminiCoachAsync(claimId, dto, apiKey, model);
            }
            catch
            {
                // Fallback silencieux sur les règles locales.
                aiResult = null;
            }
        }

        var merged = FiveWhyCoachRules.MergeWithLocal(dto, aiResult);
        return Ok(merged);
    }

    private async Task<ValidateFiveWhyStepResponseDto?> AskGeminiCoachAsync(
        Guid claimId,
        ValidateFiveWhyStepRequestDto dto,
        string apiKey,
        string model)
    {
        var branchLabel = string.Equals(dto.Branch, "DETECTION", StringComparison.OrdinalIgnoreCase)
            ? "DETECTION (pourquoi le contrôle n'a pas vu le défaut)"
            : "OCCURRENCE (pourquoi le défaut est apparu)";

        var previous = string.Join("\n",
            (dto.PreviousSteps ?? new List<FiveWhyStepDto>())
                .OrderBy(s => s.StepNumber)
                .Select(s => $"Why {s.StepNumber} — Q: {s.Question} | R: {s.Answer}"));

        var promptText = $@"Tu es un consultant Qualité Automobile Senior (IATF 16949 / 8D) chez Coficab.
Ton rôle : challenger rigoruesement une réponse au 5 Pourquoi AVANT d'autoriser le Pourquoi suivant.

Réclamation: {claimId}
Branche: {branchLabel}
Problème: {dto.ProblemStatement}
Étape Why n°{dto.StepNumber}
Chaîne précédente:
{previous}

Réponse proposée par le technicien:
""{dto.ProposedAnswer}""

RÈGLES MÉTIER STRICTES (IATF 16949 / Core Tools AIAG-VDA) :
1. ""Erreur humaine"", ""faute opérateur"", ""négligence"", ""a appuyé sur le bouton"" SANS cause systémique = BLOCK.
2. ""Le technicien / opérateur n'a pas constaté / vu / détecté"" = BLOCK : c'est un symptôme. La vraie question est pourquoi le système n'a pas empêché ou détecté.
3. L'implication d'une personne peut être un FAIT, jamais la cause racine. Exige toujours le mécanisme système (process, standard, poke-yoke, MSA, alarme...).
4. Refuse les réponses circulaires (reformulation du problème) ou trop vagues.
5. Sur branche DETECTION, oriente vers : standard de contrôle, moyen, fréquence, formation, poke-yoke, alarme, MSA.
6. Sur branche OCCURRENCE, oriente vers : cause d'apparition du défaut (process/système).

Réponds UNIQUEMENT en JSON valide (sans markdown, sans backticks) avec exactement cette forme:
{{
  ""isAccepted"": true|false,
  ""severity"": ""OK""|""WARN""|""BLOCK"",
  ""flags"": [""HUMAN_ERROR"",""TOO_SHALLOW"",""CIRCULAR"",""INCOHERENT""],
  ""coachMessage"": ""message coach en français, direct et professionnel"",
  ""suggestedFollowUpQuestions"": [""question 1"", ""question 2""]
}}

severity BLOCK = refuse le passage au Why suivant.
severity WARN = challenge fort mais le technicien peut forcer.
severity OK = accepte.";

        var requestPayload = new
        {
            contents = new[]
            {
                new { parts = new[] { new { text = promptText } } }
            },
            generationConfig = new
            {
                temperature = 0.2,
                maxOutputTokens = 1024,
                responseMimeType = "application/json"
            }
        };

        var httpClient = _httpClientFactory.CreateClient();
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        var response = await httpClient.PostAsync(
            endpoint,
            new StringContent(JsonSerializer.Serialize(requestPayload), Encoding.UTF8, "application/json"));

        if (!response.IsSuccessStatusCode)
            return null;

        var responseJson = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(responseJson);
        var root = doc.RootElement;

        if (!root.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            return null;

        if (!candidates[0].TryGetProperty("content", out var content) ||
            !content.TryGetProperty("parts", out var parts) ||
            parts.GetArrayLength() == 0 ||
            !parts[0].TryGetProperty("text", out var textElement))
            return null;

        var raw = textElement.GetString() ?? string.Empty;
        raw = raw.Trim();
        if (raw.StartsWith("```"))
        {
            var firstNl = raw.IndexOf('\n');
            if (firstNl > 0) raw = raw[(firstNl + 1)..];
            raw = raw.Replace("```", "").Trim();
        }

        var parsed = JsonSerializer.Deserialize<ValidateFiveWhyStepResponseDto>(raw, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        return parsed;
    }

    /// <summary>
    /// Safety net in case Gemini ignores the "no preamble / no markdown"
    /// instruction: strips a leading intro sentence and markdown bold/italic
    /// markers so the field always gets plain, ready-to-use text.
    /// </summary>
    private static string CleanSynthesisText(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;

        var cleaned = text.Trim();

        var introPrefixes = new[] { "Voici la synthèse", "Voici", "Synthèse :", "Synthèse:" };
        foreach (var prefix in introPrefixes)
        {
            if (cleaned.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                var colonIdx = cleaned.IndexOf(':');
                if (colonIdx >= 0 && colonIdx < 80)
                    cleaned = cleaned[(colonIdx + 1)..].Trim();
                break;
            }
        }

        cleaned = cleaned.Replace("**", "").Replace("*", "").Trim('"', '\'', ' ');

        return cleaned;
    }

    // ─── ANALYTICS & EXPORT ──────────────────────────────────────────────────

    [HttpGet("analytics/pareto")]
    public async Task<IActionResult> GetPareto(CancellationToken cancellationToken)
    {
        var result = await _mediator.Send(new GetParetoAnalysisQuery(), cancellationToken);
        return Ok(result);
    }

    [HttpGet("analytics/summary")]
    public async Task<IActionResult> GetSummary(CancellationToken cancellationToken)
    {
        var result = await _mediator.Send(new GetQualityDashboardSummaryQuery(), cancellationToken);
        return Ok(result);
    }

    [HttpGet("export-pdf/{claimId:guid}")]
    public async Task<IActionResult> ExportPdf(Guid claimId, CancellationToken cancellationToken)
    {
        var pdfBytes = await _pdfService.GenerateQualityReportPdfAsync(claimId, cancellationToken);
        return File(pdfBytes, "application/pdf", $"Quality_Report_{claimId.ToString()[..8]}.pdf");
    }

    [HttpPatch("claims/{id:guid}/start-analysis")]
    public async Task<IActionResult> StartAnalysis(Guid id, [FromBody] StartAnalysisRequestDto dto)
    {
        if (await CurrentClaimStatusAsync(id, HttpContext.RequestAborted) is "DRAFT" or "OUVERTE" or "OPEN" or "ASSIGNED")
        {
            var blocked = await WorkflowBlockAsync(id, "EN_ANALYSE", HttpContext.RequestAborted);
            if (blocked != null) return blocked;
        }

        var command = new StartClaimAnalysisCommand(id, dto.ProductionLine, dto.Shift, dto.AnalysisNotes);
        var result = await _mediator.Send(command);

        if (!result)
            return NotFound(new { message = "Réclamation non trouvée." });

        return Ok(new { message = "Statut mis à jour vers EN_ANALYSE avec succès." });
    }
    [HttpGet("5why/{claimId:guid}/suggestions")]
    public async Task<ActionResult<List<FiveWhySuggestionDto>>> GetFiveWhySuggestions(Guid claimId)
    {
        var result = await _mediator.Send(new GetFiveWhySuggestionsQuery(claimId));
        return Ok(result);
    }

    /// <summary>
    /// Propose un plan CAPA (1 plan + actions Corrective/Préventive) à partir des 2 causes racines 5 Why.
    /// </summary>
    [HttpPost("5why/{claimId:guid}/suggest-capa")]
    public async Task<IActionResult> SuggestCapa(Guid claimId, [FromBody] SuggestCapaRequestDto? dto)
    {
        var fiveWhy = await _mediator.Send(new GetFiveWhyByClaimIdQuery(claimId));
        var claim = await _db.Claims.AsNoTracking().FirstOrDefaultAsync(c => c.Id == claimId);

        var request = new SuggestCapaRequestDto
        {
            ClaimTitle = claim?.Title ?? dto?.ClaimTitle,
            ProblemStatement = !string.IsNullOrWhiteSpace(dto?.ProblemStatement)
                ? dto!.ProblemStatement
                : (fiveWhy?.ProblemStatement ?? claim?.Description ?? string.Empty),
            RootCauseOccurrence = !string.IsNullOrWhiteSpace(dto?.RootCauseOccurrence)
                ? dto!.RootCauseOccurrence
                : (fiveWhy?.RootCauseOccurrence ?? string.Empty),
            RootCauseDetection = !string.IsNullOrWhiteSpace(dto?.RootCauseDetection)
                ? dto!.RootCauseDetection
                : (fiveWhy?.RootCauseDetection ?? string.Empty),
        };

        if (string.IsNullOrWhiteSpace(request.RootCauseOccurrence) ||
            string.IsNullOrWhiteSpace(request.RootCauseDetection))
        {
            return BadRequest(new { message = "Renseignez les deux causes racines (Occurrence et Détection) avant de proposer un CAPA." });
        }

        var local = CapaSuggestionRules.BuildLocal(request);
        var ai = await TrySuggestCapaWithGeminiAsync(claimId, request);
        return Ok(ai ?? local);
    }

    /// <summary>
    /// Crée 1 ActionPlan CAPA lié au claim + les actions Corrective / Préventive éditées.
    /// </summary>
    [HttpPost("5why/{claimId:guid}/create-capa")]
    public async Task<IActionResult> CreateCapaFromFiveWhy(
        Guid claimId,
        [FromBody] CreateCapaFromFiveWhyRequestDto dto)
    {
        var claim = await _db.Claims.AsNoTracking().FirstOrDefaultAsync(c => c.Id == claimId);
        if (claim == null)
            return NotFound(new { message = "Réclamation introuvable." });

        if (dto.Actions == null || dto.Actions.Count == 0)
            return BadRequest(new { message = "Au moins une action CAPA est requise." });

        var existing = await _actionPlanService.GetByClaimIdAsync(claimId);
        if (existing.Any())
        {
            return Conflict(new
            {
                message = "Un plan CAPA existe déjà pour cette réclamation.",
                existingPlanId = existing.First().Id
            });
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? User.FindFirstValue("sub")
                  ?? "system";

        var (orgId, deptId) = await ResolveOrgDepartmentAsync(userId, dto.OrganizationId, dto.DepartmentId);
        if (orgId == Guid.Empty || deptId == Guid.Empty)
        {
            return BadRequest(new
            {
                message = "Impossible de déterminer l'organisation / département. Sélectionnez un département ou complétez le profil utilisateur."
            });
        }

        var fallback = CapaSuggestionRules.BuildLocal(new SuggestCapaRequestDto
        {
            ClaimTitle = claim.Title,
            ProblemStatement = claim.Description,
            RootCauseOccurrence = dto.Actions.FirstOrDefault(a => a.Branch == "OCCURRENCE")?.Description ?? "",
            RootCauseDetection = dto.Actions.FirstOrDefault(a => a.Branch == "DETECTION")?.Description ?? ""
        });

        var createDto = new CreateActionPlanDto
        {
            Title = string.IsNullOrWhiteSpace(dto.PlanTitle) ? fallback.PlanTitle : dto.PlanTitle!.Trim(),
            Description = string.IsNullOrWhiteSpace(dto.PlanDescription) ? fallback.PlanDescription : dto.PlanDescription,
            Type = ActionPlanType.PAC,
            OrganizationId = orgId,
            DepartmentId = deptId,
            AssignedToId = string.IsNullOrWhiteSpace(dto.AssignedToId) ? userId : dto.AssignedToId,
            Deadline = dto.Deadline ?? DateTime.UtcNow.AddDays(21),
            ClaimId = claimId,
            PlanActions = dto.Actions.Select((a, idx) => new CreatePlanActionDto
            {
                Title = string.IsNullOrWhiteSpace(a.Title)
                    ? (a.Kind == "PREVENTIVE" ? "Action préventive" : "Action corrective")
                    : a.Title.Trim(),
                Description = $"[{a.Kind}/{a.Branch}]\n{(a.Description ?? string.Empty).Trim()}",
                Priority = a.Priority is >= 1 and <= 3 ? a.Priority : 1,
                Deadline = DateTime.UtcNow.AddDays(a.SuggestedDeadlineDays > 0 ? a.SuggestedDeadlineDays : 14),
                AssignedToId = string.IsNullOrWhiteSpace(dto.AssignedToId) ? userId : dto.AssignedToId,
                Order = idx + 1,
                ActionPlanId = Guid.Empty
            }).ToList()
        };

        var plan = await _actionPlanService.CreateAsync(createDto, userId);

        // Visible dans « Mes plans » : assignation multi + droit édition.
        try
        {
            await _actionPlanService.AssignToUserAsync(new AssignActionPlanDto
            {
                UserId = userId,
                ActionPlanId = plan.Id.ToString(),
                Permissions = new ActionPlanPermissions { View = true, Edit = true, Delete = false }
            }, userId);
        }
        catch
        {
            // Non bloquant si l'assignation existe déjà / échoue : OwnerId suffit via GetUserAssignedPlansAsync.
        }

        try
        {
            var recipient =
                claim.AssignedToId
                ?? claim.CreatedBy
                ?? userId;
            if (!string.IsNullOrWhiteSpace(recipient))
            {
                await _notificationService.NotifyAsync(
                    recipient,
                    "capa_created",
                    "Nouveau plan CAPA",
                    $"Un plan CAPA a été créé pour « {claim.Title} » : {plan.Title}.",
                    actionPlanId: plan.Id,
                    linkPath: $"/pages/front/action-plans/{plan.Id}",
                    claimId: claimId);
            }
        }
        catch
        {
            // Non bloquant
        }

        return Ok(new
        {
            id = plan.Id,
            message = "Plan CAPA créé avec succès à partir du 5 Why.",
            plan
        });
    }

    [HttpGet("5why/{claimId:guid}/capa")]
    public async Task<IActionResult> GetCapaForClaim(Guid claimId)
    {
        var plans = await _actionPlanService.GetByClaimIdAsync(claimId);
        return Ok(plans);
    }

    private async Task<(Guid orgId, Guid deptId)> ResolveOrgDepartmentAsync(
        string userId,
        Guid? organizationId,
        Guid? departmentId)
    {
        if (departmentId.HasValue && departmentId.Value != Guid.Empty)
        {
            var dept = await _db.Departments.AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == departmentId.Value);
            if (dept != null)
            {
                var org = organizationId is { } o && o != Guid.Empty ? o : dept.OrganizationId;
                return (org, dept.Id);
            }
        }

        var profile = await _db.UserProfiles.AsNoTracking()
            .Include(p => p.Department)
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (profile?.DepartmentId != null && profile.Department != null)
            return (profile.Department.OrganizationId, profile.DepartmentId.Value);

        var anyDept = await _db.Departments.AsNoTracking().FirstOrDefaultAsync();
        if (anyDept != null)
            return (anyDept.OrganizationId, anyDept.Id);

        return (Guid.Empty, Guid.Empty);
    }

    private async Task<SuggestCapaResponseDto?> TrySuggestCapaWithGeminiAsync(
        Guid claimId,
        SuggestCapaRequestDto request)
    {
        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-2.0-flash";
        if (string.IsNullOrEmpty(apiKey)) return null;

        try
        {
            var prompt = $@"Tu es un consultant Qualité Automobile (IATF 16949 / 8D / CAPA) chez Coficab.
À partir des 2 causes racines du 5 Why, propose un plan CAPA minimal :
- 1 action CORRECTIVE liée à OCCURRENCE (éliminer pourquoi le défaut est apparu)
- 1 action PREVENTIVE liée à DETECTION (renforcer pourquoi le contrôle a échoué)

Réclamation: {claimId}
Titre: {request.ClaimTitle}
Problème: {request.ProblemStatement}
Cause Occurrence: {request.RootCauseOccurrence}
Cause Détection: {request.RootCauseDetection}

Réponds UNIQUEMENT en JSON valide (sans markdown) :
{{
  ""planTitle"": ""..."",
  ""planDescription"": ""..."",
  ""actions"": [
    {{
      ""kind"": ""CORRECTIVE"",
      ""branch"": ""OCCURRENCE"",
      ""title"": ""..."",
      ""description"": ""action concrète, mesurable, IATF"",
      ""priority"": 1,
      ""suggestedDeadlineDays"": 14
    }},
    {{
      ""kind"": ""PREVENTIVE"",
      ""branch"": ""DETECTION"",
      ""title"": ""..."",
      ""description"": ""..."",
      ""priority"": 1,
      ""suggestedDeadlineDays"": 21
    }}
  ]
}}";

            var payload = new
            {
                contents = new[] { new { parts = new[] { new { text = prompt } } } },
                generationConfig = new
                {
                    temperature = 0.3,
                    maxOutputTokens = 2048,
                    responseMimeType = "application/json"
                }
            };

            var http = _httpClientFactory.CreateClient();
            var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
            var response = await http.PostAsync(
                endpoint,
                new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"));

            if (!response.IsSuccessStatusCode) return null;

            var responseJson = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(responseJson);
            var root = doc.RootElement;
            if (!root.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
                return null;

            if (!candidates[0].TryGetProperty("content", out var content) ||
                !content.TryGetProperty("parts", out var parts) ||
                parts.GetArrayLength() == 0 ||
                !parts[0].TryGetProperty("text", out var textEl))
                return null;

            var raw = (textEl.GetString() ?? "").Trim();
            if (raw.StartsWith("```"))
            {
                var nl = raw.IndexOf('\n');
                if (nl > 0) raw = raw[(nl + 1)..];
                raw = raw.Replace("```", "").Trim();
            }

            var parsed = JsonSerializer.Deserialize<SuggestCapaResponseDto>(raw, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (parsed?.Actions == null || parsed.Actions.Count < 2)
                return null;

            return parsed;
        }
        catch
        {
            return null;
        }
    }

    // ─── DTOs ─────────────────────────────────────────────────────────────

    public record StartAnalysisRequestDto(string? ProductionLine, string? Shift, string? AnalysisNotes);

    public record GenerateSynthesisRequestDto(
        string Why1,
        string Why2,
        string Why3,
        string Why4,
        string Why5,
        string? ClaimTitle,
        string? DefectDescription
    );

    private string? CurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub");

    private async Task<string?> CurrentClaimStatusAsync(Guid claimId, CancellationToken ct)
    {
        var status = await _db.Claims.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.Id == claimId).Select(c => c.StatusCode).FirstOrDefaultAsync(ct);
        return status == null ? null : ClaimWorkflow.Normalize(status);
    }

    /// <summary>409 with the allowed next statuses when the configured workflow forbids this move; null when it is allowed.</summary>
    private async Task<IActionResult?> WorkflowBlockAsync(Guid claimId, string to, CancellationToken ct)
    {
        var from = await CurrentClaimStatusAsync(claimId, ct);
        if (from == null) return null; // unknown claim: the handler answers 404
        var roles = User.FindAll("role").Concat(User.FindAll(ClaimTypes.Role)).Select(c => c.Value);
        var decision = await _workflow.CheckAsync(from, to, roles, ct);
        return decision.Allowed
            ? null
            : Conflict(new { message = decision.Message, code = "workflow", allowed = decision.AllowedTargets });
    }

    private bool IsSuperAdmin()
    {
        return User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Any(c => string.Equals(c.Value, "superadmin", StringComparison.OrdinalIgnoreCase));
    }

    private bool IsQualityAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        return roles.Contains("admin")
            || roles.Contains("superadmin")
            || roles.Contains("admin_quality");
    }

    /// <summary>Admin et superadmin importent toujours. Les autres rôles ont besoin de data:import.</summary>
    private bool CanImportData()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        if (roles.Contains("admin") || roles.Contains("superadmin"))
            return true;

        return User.FindAll("permission")
            .Any(c => string.Equals(c.Value, "data:import", StringComparison.OrdinalIgnoreCase));
    }

    private static string? ResolveMe(string? value, string currentUserId)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return string.Equals(value.Trim(), "me", StringComparison.OrdinalIgnoreCase)
            ? currentUserId
            : value.Trim();
    }

    private async Task<bool> UserCanAccessClaimAsync(Guid claimId, string userId, CancellationToken ct)
    {
        var uid = userId.Trim().ToLowerInvariant();
        return await _db.Claims.AsNoTracking().AnyAsync(c =>
            c.Id == claimId && (
                (c.AssignedToId != null && c.AssignedToId.ToLower() == uid)
                || (c.CreatedById != null && c.CreatedById.ToLower() == uid)
                || _db.EightDDossiers.Any(d =>
                    d.ClaimId == c.Id
                    && d.ChampionId != null
                    && d.ChampionId.ToLower() == uid)
                || _db.ActionPlans.Any(p =>
                    p.ClaimId == c.Id
                    && !p.IsArchived
                    && (
                        (p.AssignedToId != null && p.AssignedToId.ToLower() == uid)
                        || _db.UserActionPlanAssignments.Any(a =>
                            a.ActionPlanId == p.Id && a.UserId.ToLower() == uid)
                        || _db.PlanActions.Any(pa =>
                            pa.ActionPlanId == p.Id
                            && !pa.IsArchived
                            && pa.AssignedToId != null
                            && pa.AssignedToId.ToLower() == uid)
                    ))
            ), ct);
    }
}