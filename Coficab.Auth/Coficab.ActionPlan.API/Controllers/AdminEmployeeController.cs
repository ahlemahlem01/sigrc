using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/admin/employees")]
[Authorize(Policy = "AdminOnly")]
public class AdminEmployeeController : ControllerBase
{
    private readonly IUserProfileService _userProfileService;
    private readonly IBadgeService _badgeService;
    private readonly ITimelineService _timelineService;
    private readonly IDocumentService _documentService;
    private readonly INotificationService _notificationService;
    private readonly IEmployeeActivityService _employeeActivityService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<AdminEmployeeController> _logger;

    public AdminEmployeeController(
        IUserProfileService userProfileService,
        IBadgeService badgeService,
        ITimelineService timelineService,
        IDocumentService documentService,
        INotificationService notificationService,
        IEmployeeActivityService employeeActivityService,
        IWebHostEnvironment environment,
        ILogger<AdminEmployeeController> logger)
    {
        _userProfileService = userProfileService;
        _badgeService = badgeService;
        _timelineService = timelineService;
        _documentService = documentService;
        _notificationService = notificationService;
        _employeeActivityService = employeeActivityService;
        _environment = environment;
        _logger = logger;
    }

    // ─── Profiles ────────────────────────────────────────────────────────────

    [HttpGet("profiles")]
    public async Task<IActionResult> GetAllProfiles([FromQuery] bool forceActivityRefresh = false)
    {
        // Recalcule si obsolète (ou forcé) — complète le job quotidien
        await _employeeActivityService.GetSummaryAsync(forceRecalculate: forceActivityRefresh);
        var profiles = await _userProfileService.GetAllAsync();
        return Ok(profiles);
    }

    [HttpGet("activity")]
    public async Task<IActionResult> GetActivityTracking([FromQuery] bool force = false)
    {
        var summary = await _employeeActivityService.GetSummaryAsync(forceRecalculate: force);
        return Ok(summary);
    }

    [HttpPost("activity/recalculate")]
    public async Task<IActionResult> RecalculateActivity()
    {
        var summary = await _employeeActivityService.RecalculateAllAsync();
        return Ok(summary);
    }

    [HttpGet("profiles/{userId}")]
    public async Task<IActionResult> GetProfile(string userId)
    {
        await _employeeActivityService.RecalculateUserAsync(userId);
        var profile = await _userProfileService.GetByUserIdAsync(userId);
        return profile == null ? NotFound() : Ok(profile);
    }

    [HttpPut("profiles/{userId}")]
    public async Task<IActionResult> UpdateProfile(string userId, [FromBody] UpdateUserProfileDto dto)
    {
        var existing = await _userProfileService.GetByUserIdAsync(userId);
        if (existing == null)
        {
            if (string.IsNullOrWhiteSpace(dto.Poste) || string.IsNullOrWhiteSpace(dto.Equipe))
                return BadRequest(new { error = "Les champs poste et equipe sont obligatoires." });
        }

        var updated = await _userProfileService.CreateOrUpdateAsync(userId, dto);
        return Ok(updated);
    }

    [HttpDelete("profiles/{userId}")]
    public async Task<IActionResult> DeleteProfile(string userId)
    {
        await _userProfileService.DeleteAsync(userId);
        return NoContent();
    }

    // ─── Badges ──────────────────────────────────────────────────────────────

    /// <summary>Agrégation globale — remplace le fan-out N×GetUserBadges côté frontend.</summary>
    [HttpGet("badges")]
    public async Task<IActionResult> GetAllBadges()
    {
        var badges = await _badgeService.GetAllBadgesAsync();
        return Ok(badges);
    }

    [HttpGet("badges/{userId}")]
    public async Task<IActionResult> GetUserBadges(string userId)
    {
        var badges = await _badgeService.GetUserBadgesAsync(userId);
        return Ok(badges);
    }

    [HttpPost("badges")]
    public async Task<IActionResult> AwardBadge([FromBody] CreateBadgeDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.UserId) || string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { error = "userId et name sont requis." });

        var badge = await _badgeService.CreateAsync(dto);
        await TryNotifyAsync(
            dto.UserId.Trim(),
            "badge_awarded",
            "Nouveau badge",
            $"Vous avez reçu le badge « {dto.Name} ».",
            "/badges");
        return Ok(badge);
    }

    [HttpDelete("badges/{id}")]
    public async Task<IActionResult> RemoveBadge(Guid id)
    {
        await _badgeService.DeleteAsync(id);
        return NoContent();
    }

    // ─── Timeline ────────────────────────────────────────────────────────────

    /// <summary>Agrégation globale — remplace le fan-out N×GetUserTimeline côté frontend.</summary>
    [HttpGet("timeline")]
    public async Task<IActionResult> GetAllTimelines()
    {
        var events = await _timelineService.GetAllTimelineAsync(500);
        return Ok(events);
    }

    [HttpGet("timeline/{userId}")]
    public async Task<IActionResult> GetUserTimeline(string userId)
    {
        var events = await _timelineService.GetUserTimelineAsync(userId, 50);
        return Ok(events);
    }

    [HttpPost("timeline")]
    public async Task<IActionResult> AddTimelineEvent([FromBody] CreateTimelineEventDto dto)
    {
        var evt = await _timelineService.CreateAsync(dto);
        return Ok(evt);
    }

    [HttpDelete("timeline/{id}")]
    public async Task<IActionResult> DeleteTimelineEvent(Guid id)
    {
        await _timelineService.DeleteAsync(id);
        return NoContent();
    }

    // ─── Documents ───────────────────────────────────────────────────────────

    /// <summary>Agrégation globale — remplace le fan-out N×GetUserDocuments côté frontend.</summary>
    [HttpGet("documents")]
    public async Task<IActionResult> GetAllDocuments()
    {
        var docs = await _documentService.GetAllDocumentsAsync();
        return Ok(docs);
    }

    [HttpGet("documents/{userId}")]
    public async Task<IActionResult> GetUserDocuments(string userId)
    {
        var docs = await _documentService.GetUserDocumentsAsync(userId);
        return Ok(docs);
    }

    /// <summary>
    /// Upload fichier sur disque (dossier privé App_Data) puis enregistrement en base.
    /// Seul point d'entrée : l'ancien POST documents (JSON) acceptait un FilePath arbitraire.
    /// </summary>
    [HttpPost("documents/upload")]
    [RequestSizeLimit(52_428_800)] // 50 Mo
    public async Task<IActionResult> UploadDocumentFile(
        IFormFile file, // bound from the form; [FromForm] here breaks Swagger generation
        [FromForm] string userId,
        [FromForm] string name,
        [FromForm] string type,
        [FromForm] string? description,
        [FromForm] string category,
        [FromForm] string createdBy)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "Aucun fichier fourni." });

        if (string.IsNullOrWhiteSpace(userId))
            return BadRequest(new { error = "userId requis." });

        if (!DocumentStorage.IsAllowed(file.FileName))
            return BadRequest(new
            {
                error = "Type de fichier non autorisé.",
                allowed = DocumentStorage.AllowedExtensions.OrderBy(e => e),
            });

        var storedPath = await DocumentStorage.SaveAsync(_environment, file, userId.Trim(), HttpContext.RequestAborted);

        var dto = new UploadDocumentDto
        {
            UserId = userId.Trim(),
            Name = string.IsNullOrWhiteSpace(name) ? file.FileName : name,
            Type = string.IsNullOrWhiteSpace(type) ? "FILE" : type,
            Description = description,
            FilePath = storedPath,
            Category = string.IsNullOrWhiteSpace(category) ? "General" : category,
            CreatedBy = string.IsNullOrWhiteSpace(createdBy)
                ? User.FindFirst("name")?.Value ?? "Admin"
                : createdBy,
        };

        var doc = await _documentService.UploadAsync(dto);
        await TryNotifyAsync(
            dto.UserId,
            "document_added",
            "Nouveau document",
            $"Un document a été ajouté à votre dossier : {dto.Name}.",
            "/documents");
        return Ok(doc);
    }

    /// <summary>The badge or document is already saved; a notification failure must not turn that into an error.</summary>
    private async Task TryNotifyAsync(string userId, string type, string title, string message, string linkPath)
    {
        try
        {
            await _notificationService.NotifyAsync(userId, type, title, message, actionPlanId: null, linkPath: linkPath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Notification {Type} to {UserId} failed", type, userId);
        }
    }

    [HttpDelete("documents/{id}")]
    public async Task<IActionResult> DeleteDocument(Guid id)
    {
        var storedPath = await _documentService.DeleteAsync(id);

        // Resolve only returns paths inside the document folders, so nothing else can be deleted.
        var physical = DocumentStorage.Resolve(_environment, storedPath);
        if (physical != null && System.IO.File.Exists(physical))
            System.IO.File.Delete(physical);

        return NoContent();
    }

    // ─── Recognition ─────────────────────────────────────────────────────────

    [HttpPost("recognition/notify-podium")]
    public async Task<IActionResult> NotifyPodium([FromBody] NotifyPodiumRequest request)
    {
        if (request?.Recipients == null || request.Recipients.Count == 0)
            return BadRequest(new { error = "Aucun destinataire." });

        var month = string.IsNullOrWhiteSpace(request.MonthLabel)
            ? DateTime.UtcNow.ToString("MMMM yyyy", new System.Globalization.CultureInfo("fr-FR"))
            : request.MonthLabel.Trim();

        var sent = 0;
        foreach (var recipient in request.Recipients.Take(3))
        {
            if (string.IsNullOrWhiteSpace(recipient.UserId)) continue;
            var place = recipient.Place is >= 1 and <= 3 ? recipient.Place : sent + 1;
            var placeLabel = place == 1 ? "1er" : place == 2 ? "2e" : "3e";
            var title = $"Podium de la reconnaissance — {placeLabel}";
            var message =
                $"Félicitations {recipient.FullName} : vous êtes {placeLabel} du podium ({recipient.Score} pts) pour {month}. Consultez votre tableau de bord collaborateur.";
            if (message.Length > 500) message = message[..497] + "…";

            await _notificationService.NotifyAsync(
                recipient.UserId.Trim(),
                "recognition_podium",
                title,
                message,
                actionPlanId: null,
                linkPath: "/dashboard");
            sent++;
        }

        return Ok(new { sent });
    }

    // ─── Misc ────────────────────────────────────────────────────────────────

    [HttpGet("ping")]
    public IActionResult Ping() => Ok("pong");
}

public class NotifyPodiumRequest
{
    public string? MonthLabel { get; set; }
    public List<NotifyPodiumRecipient> Recipients { get; set; } = new();
}

public class NotifyPodiumRecipient
{
    public string UserId { get; set; } = string.Empty;
    public int Place { get; set; }
    public string FullName { get; set; } = string.Empty;
    public int Score { get; set; }
}