using Microsoft.EntityFrameworkCore;
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
    private readonly IApplicationDbContext _db;
    private readonly ILogger<AdminEmployeeController> _logger;

    public AdminEmployeeController(
        IUserProfileService userProfileService,
        IBadgeService badgeService,
        ITimelineService timelineService,
        IDocumentService documentService,
        INotificationService notificationService,
        IEmployeeActivityService employeeActivityService,
        IApplicationDbContext db,
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
        _db = db;
        _logger = logger;
    }

    // ─── Department scope ────────────────────────────────────────────────────

    /// <summary>
    /// The people this caller manages: the superadmin everyone (null), an administrator the people of his own department
    /// (and himself). The employee pages show nobody else.
    /// </summary>
    private async Task<HashSet<string>?> DepartmentScopeAsync(CancellationToken ct = default)
    {
        if (User.IsInRole("superadmin")) return null;
        var me = User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? string.Empty;
        var deptId = await _db.UserProfiles.AsNoTracking().Where(p => p.UserId == me).Select(p => p.DepartmentId).FirstOrDefaultAsync(ct);
        var ids = deptId == null
            ? new List<string>()
            : await _db.UserProfiles.AsNoTracking().Where(p => p.DepartmentId == deptId && p.UserId != "").Select(p => p.UserId).ToListAsync(ct);
        var set = new HashSet<string>(ids, StringComparer.OrdinalIgnoreCase);
        if (me.Length > 0) set.Add(me);
        return set;
    }

    /// <summary>True when this person is outside the caller's scope (an administrator opening another department's employee).</summary>
    private async Task<bool> OutOfScopeAsync(string userId, CancellationToken ct = default)
        => await DepartmentScopeAsync(ct) is { } scope && !scope.Contains(userId);

    // ─── Profiles ────────────────────────────────────────────────────────────

    [HttpGet("profiles")]
    public async Task<IActionResult> GetAllProfiles([FromQuery] bool forceActivityRefresh = false, [FromQuery] string? organizationIds = null)
    {
        // Recalcule si obsolète (ou forcé) — complète le job quotidien
        await _employeeActivityService.GetSummaryAsync(forceRecalculate: forceActivityRefresh);
        var profiles = await _userProfileService.GetAllAsync();
        if (await OrganizationFilter.UserIdsAsync(_db, organizationIds, HttpContext.RequestAborted) is { } people)
            profiles = profiles.Where(p => people.Contains(p.Id)).ToList();
        if (await DepartmentScopeAsync(HttpContext.RequestAborted) is { } mine)
            profiles = profiles.Where(p => mine.Contains(p.Id)).ToList();
        return Ok(profiles);
    }

    [HttpGet("activity")]
    public async Task<IActionResult> GetActivityTracking([FromQuery] bool force = false, [FromQuery] string? organizationIds = null, [FromQuery] string? scope = null)
    {
        var summary = scope is not null && (scope.Equals("plans", StringComparison.OrdinalIgnoreCase) || scope.Equals("claims", StringComparison.OrdinalIgnoreCase))
            ? await _employeeActivityService.GetScopedSummaryAsync(scope)
            : await _employeeActivityService.GetSummaryAsync(forceRecalculate: force);
        if (await OrganizationFilter.UserIdsAsync(_db, organizationIds, HttpContext.RequestAborted) is { } people)
        {
            var items = summary.Items.Where(i => people.Contains(i.UserId)).ToList();
            summary = new EmployeeActivitySummaryDto
            {
                Total = items.Count,
                Active = items.Count(i => i.ActivityStatus == Core.Enums.ActivityStatus.Active),
                LowActivity = items.Count(i => i.ActivityStatus == Core.Enums.ActivityStatus.LowActivity),
                Inactive = items.Count(i => i.ActivityStatus == Core.Enums.ActivityStatus.Inactive),
                ComputedAt = summary.ComputedAt,
                Items = items,
            };
        }
        if (await DepartmentScopeAsync(HttpContext.RequestAborted) is { } mineActivity)
        {
            var items = summary.Items.Where(i => mineActivity.Contains(i.UserId)).ToList();
            summary = new EmployeeActivitySummaryDto
            {
                Total = items.Count,
                Active = items.Count(i => i.ActivityStatus == Core.Enums.ActivityStatus.Active),
                LowActivity = items.Count(i => i.ActivityStatus == Core.Enums.ActivityStatus.LowActivity),
                Inactive = items.Count(i => i.ActivityStatus == Core.Enums.ActivityStatus.Inactive),
                ComputedAt = summary.ComputedAt,
                Items = items,
            };
        }
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
        if (await OutOfScopeAsync(userId, HttpContext.RequestAborted)) return Forbid();
        await _employeeActivityService.RecalculateUserAsync(userId);
        var profile = await _userProfileService.GetByUserIdAsync(userId);
        return profile == null ? NotFound() : Ok(profile);
    }

    [HttpPut("profiles/{userId}")]
    public async Task<IActionResult> UpdateProfile(string userId, [FromBody] UpdateUserProfileDto dto)
    {
        if (await OutOfScopeAsync(userId, HttpContext.RequestAborted)) return Forbid();
        var existing = await _userProfileService.GetByUserIdAsync(userId);
        if (existing == null)
        {
            if (string.IsNullOrWhiteSpace(dto.Poste) || string.IsNullOrWhiteSpace(dto.Equipe))
                return BadRequest(new { error = "Les champs poste et equipe sont obligatoires." });
        }

        var updated = await _userProfileService.CreateOrUpdateAsync(userId, dto);
        return Ok(updated);
    }

    /// <summary>Org chart drag-and-drop: moves an employee to another department (profile only; the account is updated by the Auth API).</summary>
    /// <summary>Names (or clears) the hierarchical manager of an employee. The manager keeps his own role: this adds no right except reading the QRQC problems of the people he manages.</summary>
    [HttpPut("profiles/{userId}/manager")]
    public async Task<IActionResult> SetManager(string userId, [FromBody] SetManagerRequest dto, CancellationToken ct)
    {
        if (await OutOfScopeAsync(userId, ct)) return Forbid();
        var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == userId, ct);
        if (profile == null) return NotFound();

        if (string.IsNullOrWhiteSpace(dto.ManagerUserId))
        {
            profile.ManagerId = null; profile.ManagerName = null; profile.ManagerEmail = null;
        }
        else
        {
            var wanted = dto.ManagerUserId;
            if (wanted.Equals(userId, StringComparison.OrdinalIgnoreCase))
                return BadRequest("Un employé ne peut pas être son propre chef hiérarchique.");
            var manager = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == wanted, ct);
            if (manager == null) return BadRequest("Chef hiérarchique introuvable.");
            if ((manager.ManagerId ?? string.Empty).Equals(userId, StringComparison.OrdinalIgnoreCase))
                return BadRequest("Ce chef hiérarchique dépend déjà de cet employé.");
            profile.ManagerId = manager.UserId; profile.ManagerName = manager.Name; profile.ManagerEmail = manager.Email;
        }
        profile.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(new { profile.UserId, profile.ManagerId, profile.ManagerName });
    }

    public sealed class PersonalDataRequest
    {
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Site { get; set; }
        public List<string>? AdditionalEmails { get; set; }
        public DateTime? DateOfBirth { get; set; }
        public List<string>? Nationalities { get; set; }
        public string? CinNumber { get; set; }
        public DateTime? CinDate { get; set; }
        public string? CinCountry { get; set; }
        public string? PassportNumber { get; set; }
        public DateTime? PassportValidFrom { get; set; }
        public DateTime? PassportValidTill { get; set; }
        public string? PassportCountry { get; set; }
        public string? FatherName { get; set; }
        public string? FatherLastName { get; set; }
        public string? MotherName { get; set; }
        public string? MotherLastName { get; set; }
    }

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    /// <summary>Personal data of the specification (identity, passport, parents). Administrators only.</summary>
    [HttpGet("profiles/{userId}/personal")]
    public async Task<IActionResult> GetPersonal(string userId, CancellationToken ct)
    {
        if (await OutOfScopeAsync(userId, ct)) return Forbid();
        var p = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == userId, ct);
        if (p == null) return NotFound();
        return Ok(new
        {
            p.FirstName, p.LastName, p.Site,
            additionalEmails = (p.AdditionalEmails ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            p.DateOfBirth,
            nationalities = (p.Nationalities ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            p.CinNumber, p.CinDate, p.CinCountry, p.PassportNumber, p.PassportValidFrom, p.PassportValidTill, p.PassportCountry,
            p.FatherName, p.FatherLastName, p.MotherName, p.MotherLastName,
        });
    }

    [HttpPut("profiles/{userId}/personal")]
    public async Task<IActionResult> SetPersonal(string userId, [FromBody] PersonalDataRequest r, CancellationToken ct)
    {
        if (await OutOfScopeAsync(userId, ct)) return Forbid();
        var p = await _db.UserProfiles.FirstOrDefaultAsync(x => x.UserId == userId, ct);
        if (p == null) return NotFound();

        var today = DateTime.UtcNow.Date;
        if (r.DateOfBirth.HasValue && r.DateOfBirth.Value.Date >= today) return BadRequest(new { message = "La date de naissance doit être dans le passé." });
        if (r.CinDate.HasValue && r.CinDate.Value.Date > today) return BadRequest(new { message = "La date de la CIN ne peut pas être dans le futur." });
        if (r.PassportValidFrom.HasValue && r.PassportValidTill.HasValue && r.PassportValidTill < r.PassportValidFrom)
            return BadRequest(new { message = "La fin de validité du passeport doit suivre son début." });

        var extraEmails = (r.AdditionalEmails ?? new()).Select(e => e.Trim()).Where(e => e.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (extraEmails.Any(e => !System.Net.Mail.MailAddress.TryCreate(e, out var addr) || addr.Address != e))
            return BadRequest(new { message = "Une des adresses e-mail supplémentaires n'est pas valide." });

        static DateTime? Utc(DateTime? d) => d.HasValue ? DateTime.SpecifyKind(d.Value.Date, DateTimeKind.Utc) : null;
        p.FirstName = Clean(r.FirstName);
        p.LastName = Clean(r.LastName);
        p.Site = Clean(r.Site);
        p.AdditionalEmails = extraEmails.Count == 0 ? null : string.Join(", ", extraEmails);
        p.DateOfBirth = Utc(r.DateOfBirth);
        var nationalities = (r.Nationalities ?? new()).Select(n => n.Trim()).Where(n => n.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        p.Nationalities = nationalities.Count == 0 ? null : string.Join(", ", nationalities);
        p.CinNumber = Clean(r.CinNumber);
        p.CinDate = Utc(r.CinDate);
        p.CinCountry = Clean(r.CinCountry);
        p.PassportNumber = Clean(r.PassportNumber);
        p.PassportValidFrom = Utc(r.PassportValidFrom);
        p.PassportValidTill = Utc(r.PassportValidTill);
        p.PassportCountry = Clean(r.PassportCountry);
        p.FatherName = Clean(r.FatherName);
        p.FatherLastName = Clean(r.FatherLastName);
        p.MotherName = Clean(r.MotherName);
        p.MotherLastName = Clean(r.MotherLastName);
        p.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    public sealed class ArchiveRequest
    {
        public bool Archived { get; set; }
    }

    /// <summary>
    /// Status "archived" of the specification: the person left the company. The profile is kept (nothing is deleted) and the console also
    /// locks the account. Restoring puts the HR status back to active.
    /// </summary>
    [HttpPut("profiles/{userId}/archive")]
    public async Task<IActionResult> Archive(string userId, [FromBody] ArchiveRequest request, CancellationToken ct)
    {
        if (await OutOfScopeAsync(userId, ct)) return Forbid();
        var p = await _db.UserProfiles.FirstOrDefaultAsync(x => x.UserId == userId, ct);
        if (p == null) return NotFound();
        p.Status = request.Archived ? "archived" : "active";
        p.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(new { p.UserId, p.Status });
    }

    [HttpPut("profiles/{userId}/department")]
    public async Task<IActionResult> MoveToDepartment(string userId, [FromBody] MoveDepartmentDto dto)
    {
        var result = await _userProfileService.MoveToDepartmentAsync(userId, dto.DepartmentId);
        return result switch
        {
            DepartmentMoveResult.Moved => NoContent(),
            DepartmentMoveResult.ProfileNotFound => NotFound(new { error = "Profil introuvable." }),
            _ => BadRequest(new { error = "Département introuvable ou archivé." }),
        };
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
    public async Task<IActionResult> GetAllBadges([FromQuery] string? organizationIds = null)
    {
        var badges = await _badgeService.GetAllBadgesAsync();
        if (await OrganizationFilter.UserIdsAsync(_db, organizationIds, HttpContext.RequestAborted) is { } people)
            badges = badges.Where(b => people.Contains(b.UserId)).ToList();
        if (await DepartmentScopeAsync(HttpContext.RequestAborted) is { } mine)
            badges = badges.Where(b => mine.Contains(b.UserId)).ToList();
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

    /// <summary>Gives every employee the automatic badges their closed claims already earned. Never removes anything.</summary>
    [HttpPost("badges/recalculate")]
    public async Task<IActionResult> RecalculateBadges()
    {
        var awarded = await _badgeService.AwardEarnedForEveryoneAsync();
        return Ok(new
        {
            awarded = awarded.Count,
            employees = awarded.Select(b => b.UserId).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
        });
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
    public async Task<IActionResult> GetAllTimelines([FromQuery] string? organizationIds = null)
    {
        var events = await _timelineService.GetAllTimelineAsync(500);
        if (await OrganizationFilter.UserIdsAsync(_db, organizationIds, HttpContext.RequestAborted) is { } people)
            events = events.Where(e => people.Contains(e.UserId)).ToList();
        if (await DepartmentScopeAsync(HttpContext.RequestAborted) is { } mine)
            events = events.Where(e => mine.Contains(e.UserId)).ToList();
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
    public async Task<IActionResult> GetAllDocuments([FromQuery] string? organizationIds = null)
    {
        var docs = await _documentService.GetAllDocumentsAsync();
        if (await OrganizationFilter.UserIdsAsync(_db, organizationIds, HttpContext.RequestAborted) is { } people)
            docs = docs.Where(d => d.UserId != null && people.Contains(d.UserId)).ToList();
        if (await DepartmentScopeAsync(HttpContext.RequestAborted) is { } mine)
            docs = docs.Where(d => d.UserId != null && mine.Contains(d.UserId)).ToList();
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

public class SetManagerRequest
{
    public string? ManagerUserId { get; set; }
}
