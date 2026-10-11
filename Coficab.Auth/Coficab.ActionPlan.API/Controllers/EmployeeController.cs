using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class EmployeeController : ControllerBase
{
    private readonly IActionPlanService _actionPlanService;
    private readonly IUserProfileService _userProfileService;
    private readonly IBadgeService _badgeService;
    private readonly ITimelineService _timelineService;
    private readonly IDocumentService _documentService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<EmployeeController> _logger;

    public EmployeeController(
        IActionPlanService actionPlanService,
        IUserProfileService userProfileService,
        IBadgeService badgeService,
        ITimelineService timelineService,
        IDocumentService documentService,
        IWebHostEnvironment environment,
        ILogger<EmployeeController> logger)
    {
        _actionPlanService = actionPlanService;
        _userProfileService = userProfileService;
        _badgeService = badgeService;
        _timelineService = timelineService;
        _documentService = documentService;
        _environment = environment;
        _logger = logger;
    }

    private string GetUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? string.Empty;
    }

    // ─── 1. Profil ─────────────────────────────────────────────────────
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { error = "Utilisateur non authentifié." });

            var profile = await _userProfileService.GetByUserIdAsync(userId);

            // Extract claims from token for fallbacks
            var claimName = User.FindFirst("name")?.Value
                         ?? User.FindFirst(ClaimTypes.Name)?.Value
                         ?? ExtractNameFromEmail(User.FindFirst("email")?.Value ?? User.FindFirst(ClaimTypes.Email)?.Value);

            var claimEmail = User.FindFirst("email")?.Value ?? User.FindFirst(ClaimTypes.Email)?.Value ?? "";
            var claimRole = User.FindFirst("role")?.Value ?? User.FindFirst(ClaimTypes.Role)?.Value ?? "Collaborateur";

            if (profile != null)
            {
                // Fill missing database fields dynamically using JWT claims
                if (string.IsNullOrWhiteSpace(profile.Name) || profile.Name == "Utilisateur")
                {
                    profile.Name = !string.IsNullOrWhiteSpace(claimName) ? claimName : "Utilisateur";
                }
                if (string.IsNullOrWhiteSpace(profile.Email))
                {
                    profile.Email = claimEmail;
                }
                if (string.IsNullOrWhiteSpace(profile.Department))
                {
                    profile.Department = User.FindFirst("department")?.Value ?? "";
                }
                if (string.IsNullOrWhiteSpace(profile.ManagerName))
                {
                    profile.ManagerName = User.FindFirst("manager_name")?.Value
                        ?? User.FindFirst("managerName")?.Value
                        ?? "";
                }
                if (string.IsNullOrWhiteSpace(profile.ManagerEmail))
                {
                    profile.ManagerEmail = User.FindFirst("manager_email")?.Value
                        ?? User.FindFirst("managerEmail")?.Value
                        ?? "";
                }
                if (string.IsNullOrWhiteSpace(profile.Role) || profile.Role == "Collaborateur")
                {
                    profile.Role = claimRole;
                }
                return Ok(profile);
            }

            // Database row doesn't exist yet: construct complete profile DTO from claims
            var fallbackProfile = new UserProfileDto
            {
                Id = userId,
                Name = !string.IsNullOrWhiteSpace(claimName) ? claimName : "Utilisateur",
                Email = claimEmail,
                Role = claimRole,
                Department = User.FindFirst("department")?.Value ?? "IT",
                ManagerName = User.FindFirst("manager_name")?.Value ?? "—",
                ManagerEmail = User.FindFirst("manager_email")?.Value ?? "",
                HireDate = User.FindFirst("hire_date")?.Value ?? DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Status = User.FindFirst("status")?.Value ?? "active",
                Phone = User.FindFirst("phone")?.Value,
                Poste = "Collaborateur Coficab",
                Equipe = "Équipe Générale",
            };

            return Ok(fallbackProfile);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetProfile");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 1b. Mettre à jour le Profil ─────────────────────────────────────────
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateUserProfileDto dto)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { error = "Utilisateur non authentifié." });

            if (dto == null)
                return BadRequest(new { error = "Données invalides." });

            var updatedProfile = await _userProfileService.UpdateProfileAsync(userId, dto);

            return Ok(updatedProfile);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la mise à jour du profil");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 1c. Upload de l'Avatar ─────────────────────────────────────────────────
    [HttpPost("profile/avatar")]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { error = "Utilisateur non authentifié." });

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Aucun fichier fourni." });

            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp" };
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
                return BadRequest(new { error = "Format non supporté (JPG, PNG ou WEBP uniquement)." });

            if (file.Length > 5 * 1024 * 1024)
                return BadRequest(new { error = "La taille du fichier dépasse 5 Mo." });

            var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var uploadsFolder = Path.Combine(webRoot, "uploads", "avatars");

            if (!Directory.Exists(uploadsFolder))
                Directory.CreateDirectory(uploadsFolder);

            var fileName = $"avatar_{userId}_{DateTime.UtcNow.Ticks}{extension}";
            var filePath = Path.Combine(uploadsFolder, fileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var relativeUrl = $"/uploads/avatars/{fileName}";

            var updatedProfile = await _userProfileService.UpdateAvatarAsync(userId, relativeUrl);

            return Ok(new { profilePictureUrl = relativeUrl, profile = updatedProfile });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de l'upload de l'avatar");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 2. Badges ───────────────────────────────────────────────────────
    [HttpGet("badges")]
    public async Task<IActionResult> GetBadges()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var badges = await _badgeService.GetUserBadgesAsync(userId);
            return Ok(badges);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetBadges");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 3. Historique complétés ─────────────────────────────────────────
    [HttpGet("completed-plans")]
    public async Task<IActionResult> GetCompletedPlans()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var assigned = await _actionPlanService.GetUserAssignedPlansAsync(userId);

            var completed = assigned
                .Where(p => p.CompletedAt.HasValue)
                .Select(p => new CompletedPlanDto
                {
                    Id = p.Id,
                    Title = p.Title,
                    CompletedAt = p.CompletedAt!.Value.ToString("yyyy-MM-dd"),
                    PlanType = "Général",
                    Duration = "—",
                    IsOnTime = p.IsOnTime
                })
                .ToList();

            return Ok(completed);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetCompletedPlans");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 4. Timeline ─────────────────────────────────────────────────────
    [HttpGet("timeline")]
    public async Task<IActionResult> GetTimeline()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var dbEvents = await _timelineService.GetUserTimelineAsync(userId, 20);
            var assigned = await _actionPlanService.GetUserAssignedPlansAsync(userId);
            var derivedEvents = new List<TimelineEventDto>();

            foreach (var plan in assigned.OrderByDescending(p => p.CreatedAt).Take(5))
            {
                derivedEvents.Add(new TimelineEventDto
                {
                    Id = $"assign-{plan.Id}",
                    Type = "assignment",
                    Title = "Nouveau plan assigné",
                    Description = plan.Title,
                    Timestamp = plan.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
                    PlanId = plan.Id
                });
            }

            var allEvents = dbEvents.Concat(derivedEvents)
                .OrderByDescending(e => e.Timestamp)
                .Take(20)
                .ToList();

            return Ok(allEvents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetTimeline");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 5. Compétences ────────────────────────────────────────────────────
    [HttpGet("skills")]
    public async Task<IActionResult> GetSkills()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var assigned = (await _actionPlanService.GetUserAssignedPlansAsync(userId)).ToList();
            var completed = assigned.Where(p => p.Progress == 100 || p.Progress == 101).ToList();

            var skills = new List<SkillDto>
            {
                new() {
                    Name = "Gestion de Projet",
                    Level = Math.Min(completed.Count * 10, 100),
                    PlansCompleted = completed.Count
                },
                new() {
                    Name = "Exécution",
                    Level = completed.Count > 0 ? 75 : 0,
                    PlansCompleted = completed.Count
                },
                new() {
                    Name = "Planification",
                    Level = assigned.Count > 0 ? Math.Min(assigned.Count * 5, 100) : 0,
                    PlansCompleted = assigned.Count
                }
            };

            return Ok(skills);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetSkills");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 6. Équipe ───────────────────────────────────────────────────────
    [HttpGet("team")]
    public async Task<IActionResult> GetTeam()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var team = await _userProfileService.GetTeamMembersAsync(userId);
            return Ok(team);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetTeam");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 7. Documents ────────────────────────────────────────────────────
    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var docs = await _documentService.GetUserDocumentsAsync(userId);
            return Ok(docs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetDocuments");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    // ─── 8. Stats rapides ────────────────────────────────────────────────
    [HttpGet("stats")]
    public async Task<IActionResult> GetQuickStats()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var assigned = await _actionPlanService.GetUserAssignedPlansAsync(userId);
            var completed = assigned.Count(p => p.Progress == 100 || p.Progress == 101);
            var total = assigned.Count();

            var stats = new QuickStatsDto
            {
                TotalPlans = total,
                Completed = completed,
                OnTimeRate = total > 0 ? (completed * 100 / total) : 0,
                WeeklyStreak = 0,
                BadgesCount = 0,
                FastCompletions = 0
            };

            return Ok(stats);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetQuickStats");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    private static string? ExtractNameFromEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            return null;

        var prefix = email.Split('@')[0].Replace('.', ' ');
        return System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(prefix);
    }
}