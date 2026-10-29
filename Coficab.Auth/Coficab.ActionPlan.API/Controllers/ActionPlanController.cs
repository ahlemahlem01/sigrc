using Microsoft.EntityFrameworkCore;
using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.DTOs.ActionPlan;
using Coficab.ActionPlan.Core.DTOs.Department;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OpenIddict.Abstractions;          // ✅ ADDED: required for OpenIddictConstants
using System.Security.Claims;


namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ActionPlanController : ControllerBase
{
    private readonly IActionPlanService _actionPlanService;
    private readonly IPlanActionService _planActionService;
    private readonly IDepartmentService _departmentService;
    private readonly IUserService _userService;
    private readonly ILogger<ActionPlanController> _logger;
    private readonly INotificationService _notificationService;
    private readonly IApplicationDbContext _db;

    public ActionPlanController(
        IActionPlanService actionPlanService,
        IUserService userService,
        IPlanActionService planActionService,
        IDepartmentService departmentService,
        INotificationService notificationService,
        IApplicationDbContext db,
        ILogger<ActionPlanController> logger)
    {
        _db = db;
        _planActionService = planActionService;
        _actionPlanService = actionPlanService;
        _departmentService = departmentService;
        _userService = userService;
        _notificationService = notificationService;
        _logger = logger;
    }

    // ✅ FIXED: Centralized helper — OpenIddict stores "sub" under its own
    // claim type URI, not under ClaimTypes.NameIdentifier. Checking
    // OpenIddictConstants.Claims.Subject first guarantees we always get
    // the user's Id regardless of how the claim type is mapped.
    private string? GetCurrentUserId() =>
        User.FindFirst(OpenIddictConstants.Claims.Subject)?.Value
        ?? User.FindFirst("sub")?.Value
        ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

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

    private bool IsPlatformAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        return roles.Contains("admin") || roles.Contains("superadmin");
    }

    private bool IsSuperAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .ToHashSet();

        return roles.Contains("superadmin");
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool includeActions = false, [FromQuery] string? organizationIds = null, [FromQuery] string? domain = null)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        if (IsQualityAdmin())
        {
            var plans = await _actionPlanService.GetVisibleAsync(userId, IsSuperAdmin(), includeActions);
            if (OrganizationFilter.Parse(organizationIds) is { } orgs)
                plans = plans.Where(p => orgs.Contains(p.OrganizationId)).ToList();
            if (!string.IsNullOrWhiteSpace(domain))
                plans = plans.Where(p => string.Equals(p.Domain, domain.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
            return Ok(plans);
        }

        // an employee only gets the plans assigned to them; the domain narrows that list, it never widens it
        var mine = await _actionPlanService.GetUserAssignedPlansAsync(userId);
        if (!string.IsNullOrWhiteSpace(domain))
            mine = mine.Where(p => string.Equals(p.Domain, domain.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        return Ok(mine);
    }

    [HttpGet("steering")]
    public async Task<IActionResult> GetSteering([FromQuery] string? organizationIds = null, [FromQuery] string? domain = null)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        if (!IsQualityAdmin())
            return Forbid();

        var rows = await _actionPlanService.GetSteeringAsync(userId, IsSuperAdmin());
        if (OrganizationFilter.Parse(organizationIds) is { } orgs)
            rows = rows.Where(r => orgs.Contains(r.OrganizationId)).ToList();
        if (!string.IsNullOrWhiteSpace(domain))
            rows = rows.Where(r => string.Equals(r.Domain, domain.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        return Ok(rows);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        if (IsQualityAdmin())
        {
            var plan = await _actionPlanService.GetByIdAsync(id);
            if (plan is null) return NotFound();
            if (!string.IsNullOrWhiteSpace(plan.CreatedBy))
            {
                var aliases = await Application.QualityAnalyses.Queries.Claims.ClaimVisibility.AliasesAsync(_db, HttpContext.RequestAborted);
                var current = aliases.TryGetValue(plan.CreatedBy, out var replacement) ? replacement : plan.CreatedBy;
                plan.CreatedByName = await _db.UserProfiles.AsNoTracking().Where(p => p.UserId == current).Select(p => p.Name).FirstOrDefaultAsync();
            }
            if (string.IsNullOrWhiteSpace(plan.DepartmentName))
                plan.DepartmentName = await _db.Departments.AsNoTracking().Where(d => d.Id == plan.DepartmentId).Select(d => d.Name).FirstOrDefaultAsync() ?? string.Empty;
            return Ok(plan);
        }

        var assigned = await _actionPlanService.GetAssignedPlanByIdAsync(id, userId);
        if (assigned != null)
            return Ok(assigned);

        return Forbid();
    }

    /// <summary>The whole plan page in one call: people, health, actions and history (quality admins).</summary>
    [HttpGet("{id:guid}/detail")]
    public async Task<IActionResult> GetDetail(Guid id, [FromServices] MediatR.IMediator mediator)
    {
        if (!IsQualityAdmin()) return Forbid();
        var detail = await mediator.Send(new Application.Dashboard.Queries.GetPlanDetailQuery(id), HttpContext.RequestAborted);
        return detail is null ? NotFound() : Ok(detail);
    }

    [HttpGet("department/{departmentId}")]
    public async Task<IActionResult> GetByDepartment(Guid departmentId)
    {
        if (!IsQualityAdmin())
            return Forbid();
        var plans = await _actionPlanService.GetByDepartmentAsync(departmentId);
        return Ok(plans);
    }

    [HttpGet("owner/{ownerId}")]
    public async Task<IActionResult> GetByOwner(string ownerId)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        if (!IsQualityAdmin()
            && !string.Equals(ownerId.Trim(), userId, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var plans = await _actionPlanService.GetByOwnerAsync(ownerId);
        return Ok(plans);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateActionPlanDto dto)
    {
        var createdBy = GetCurrentUserId() ?? "system";  // ✅ FIXED
        var plan = await _actionPlanService.CreateAsync(dto, createdBy);
        return CreatedAtAction(nameof(GetById), new { id = plan.Id }, plan);
    }

    /// <summary>
    /// CSV des plans d'action. Colonnes : Title, Type, Department, Description, Deadline.
    /// Type : preventif, correctif, amelioration (ou PA, PAC, PAP).
    /// Department : nom, code ou identifiant du département.
    /// </summary>
    [HttpPost("import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> Import(IFormFile file, CancellationToken cancellationToken)
    {
        if (!IsPlatformAdmin())
            return Forbid();

        var createdBy = GetCurrentUserId();
        if (string.IsNullOrEmpty(createdBy))
            return Unauthorized(new { message = "Utilisateur non authentifié." });

        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Fichier CSV requis." });

        string text;
        using (var reader = new StreamReader(file.OpenReadStream()))
            text = await reader.ReadToEndAsync(cancellationToken);

        var rows = ParsePlanCsv(text);
        if (rows.Count == 0)
            return BadRequest(new { message = "Aucune ligne à importer. En-tête attendu : Titre, Type, Département, Description, Date limite." });
        if (rows.Count > 300)
            return BadRequest(new { message = "Maximum 300 plans par fichier." });

        var departments = (await _departmentService.GetAllAsync()).ToList();
        var created = new List<Guid>();
        var errors = new List<object>();

        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            if (string.IsNullOrWhiteSpace(row.Title))
            {
                errors.Add(new { line = i + 2, message = "Title est requis." });
                continue;
            }

            if (!TryParsePlanType(row.Type, out var type))
            {
                errors.Add(new { line = i + 2, message = "Type invalide. Valeurs : preventif, correctif, amelioration." });
                continue;
            }

            var department = ResolveDepartment(departments, row.Department);
            if (department == null)
            {
                errors.Add(new { line = i + 2, message = "Département introuvable." });
                continue;
            }

            DateTime? deadline = null;
            if (!string.IsNullOrWhiteSpace(row.Deadline))
            {
                if (!DateTime.TryParse(row.Deadline, out var parsed))
                {
                    errors.Add(new { line = i + 2, message = "Deadline invalide." });
                    continue;
                }
                deadline = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
            }

            try
            {
                var plan = await _actionPlanService.CreateAsync(new CreateActionPlanDto
                {
                    Title = row.Title.Trim(),
                    Description = row.Description?.Trim(),
                    Type = type,
                    DepartmentId = department.Id,
                    OrganizationId = department.OrganizationId,
                    Deadline = deadline
                }, createdBy);
                created.Add(plan.Id);
            }
            catch (Exception ex)
            {
                errors.Add(new { line = i + 2, message = ex.Message });
            }
        }

        return Ok(new { created = created.Count, ids = created, errors });
    }

    private sealed record CsvPlanRow(string Title, string? Type, string? Department, string? Description, string? Deadline);

    private static bool TryParsePlanType(string? raw, out ActionPlanType type)
    {
        var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
        switch (value)
        {
            case "1":
            case "pa":
            case "preventif":
            case "préventif":
                type = ActionPlanType.PA;
                return true;
            case "2":
            case "pac":
            case "correctif":
                type = ActionPlanType.PAC;
                return true;
            case "3":
            case "pap":
            case "amelioration":
            case "amélioration":
                type = ActionPlanType.PAP;
                return true;
            default:
                type = default;
                return false;
        }
    }

    private static DepartmentDto? ResolveDepartment(IReadOnlyList<DepartmentDto> departments, string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var value = raw.Trim();
        if (Guid.TryParse(value, out var id))
            return departments.FirstOrDefault(d => d.Id == id);

        var hits = departments.Where(d =>
            string.Equals(d.Name, value, StringComparison.OrdinalIgnoreCase)
            || string.Equals(d.Code, value, StringComparison.OrdinalIgnoreCase)).ToList();
        return hits.Count == 1 ? hits[0] : null;
    }

    private static List<CsvPlanRow> ParsePlanCsv(string text)
    {
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length < 2) return [];

        var delimiter = lines[0].Contains(';') && !lines[0].Contains(',') ? ';' : ',';
        var header = SplitCsvLine(lines[0], delimiter)
            .Select(h => h.Trim().Trim('"').ToLowerInvariant())
            .ToList();
        var iTitle = ImportTemplateComposer.HeaderIndex(header, "title", "titre");
        var iType = ImportTemplateComposer.HeaderIndex(header, "type");
        var iDept = ImportTemplateComposer.HeaderIndex(header, "department", "departement");
        var iDesc = ImportTemplateComposer.HeaderIndex(header, "description");
        var iDeadline = ImportTemplateComposer.HeaderIndex(header, "deadline", "date limite", "echeance");
        if (iTitle < 0 || iDept < 0) return [];

        string? Cell(IReadOnlyList<string> cells, int index) =>
            index >= 0 && index < cells.Count ? cells[index] : null;

        var rows = new List<CsvPlanRow>();
        for (var i = 1; i < lines.Length; i++)
        {
            var cells = SplitCsvLine(lines[i], delimiter);
            if (cells.All(string.IsNullOrWhiteSpace)) continue;
            if (ImportTemplateComposer.IsExample(Cell(cells, iTitle))) continue;
            rows.Add(new CsvPlanRow(
                Cell(cells, iTitle) ?? "",
                Cell(cells, iType),
                Cell(cells, iDept),
                Cell(cells, iDesc),
                Cell(cells, iDeadline)));
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

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateActionPlanDto dto)
    {
        var updatedBy = GetCurrentUserId() ?? "system";  // ✅ FIXED
        var plan = await _actionPlanService.UpdateAsync(id, dto, updatedBy);
        return Ok(plan);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Archive(Guid id)
    {
        var archivedBy = GetCurrentUserId() ?? "system";  // ✅ FIXED
        await _actionPlanService.ArchiveAsync(id, archivedBy);
        return NoContent();
    }

    public sealed class ExtendPlanDeadlineDto
    {
        public DateTime? NewDeadline { get; set; }
        public string? Reason { get; set; }
    }

    /// <summary>
    /// Administrators and super administrators give a late CAPA plan more time. A reason is required; the old date, the new date
    /// and the reason are kept in the plan history in the same save. Never moves a date backwards.
    /// </summary>
    [HttpPost("{id:guid}/deadline-extension")]
    public async Task<IActionResult> ExtendDeadline(Guid id, [FromBody] ExtendPlanDeadlineDto dto, CancellationToken ct)
    {
        if (!IsPlatformAdmin()) return Forbid();
        var by = GetCurrentUserId();
        if (string.IsNullOrEmpty(by)) return Unauthorized(new { code = "unauthenticated", message = "Utilisateur non authentifié." });
        if (dto?.NewDeadline is null) return BadRequest(new { code = "newDateRequired", message = "La nouvelle date est requise." });

        var visible = await _actionPlanService.GetVisibleIdsAsync(by, IsSuperAdmin());
        if (!visible.Contains(id)) return NotFound(new { code = "notFound", message = "Plan non trouvé." });

        var result = await _actionPlanService.ExtendDeadlineAsync(id, dto.NewDeadline.Value, dto.Reason ?? string.Empty, by, ct);
        return result.Code switch
        {
            null => Ok(new { oldDeadline = result.OldDeadline, newDeadline = result.NewDeadline, extraDays = result.ExtraDays }),
            "notFound" => NotFound(new { code = result.Code, message = "Plan non trouvé." }),
            _ => BadRequest(new { code = result.Code, message = "Prolongation refusée : " + result.Code }),
        };
    }

    /// <summary>Administrators: sends a warning about a plan to one person; it is kept in the plan history.</summary>
    [HttpPost("{id:guid}/warn")]
    public async Task<IActionResult> Warn(Guid id, [FromBody] WarnPlanDto dto)
    {
        if (!IsQualityAdmin()) return Forbid();
        var by = GetCurrentUserId();
        if (string.IsNullOrEmpty(by)) return Unauthorized(new { error = "Utilisateur non authentifié." });
        if (string.IsNullOrWhiteSpace(dto.UserId) || string.IsNullOrWhiteSpace(dto.Message) || dto.Message.Length > 500)
            return BadRequest(new { error = "Choisissez un destinataire et un message de 500 caractères maximum." });

        var visible = await _actionPlanService.GetVisibleIdsAsync(by, IsSuperAdmin());
        if (!visible.Contains(id)) return NotFound(new { error = "Plan non trouvé." });

        try
        {
            await _actionPlanService.WarnAsync(id, dto.UserId.Trim(), dto.Message.Trim(), by);
            return Ok(new { message = "Avertissement envoyé." });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Plan non trouvé." });
        }
    }

    /// <summary>Gives the same responsible to several plans at once; each plan goes through the normal update, so it is logged in its history.</summary>
    [HttpPost("bulk-assign")]
    public async Task<IActionResult> BulkAssign([FromBody] BulkAssignDto dto)
    {
        if (!IsQualityAdmin()) return Forbid();
        var by = GetCurrentUserId();
        if (string.IsNullOrEmpty(by)) return Unauthorized(new { error = "Utilisateur non authentifié." });
        if (string.IsNullOrWhiteSpace(dto.UserId) || dto.PlanIds is not { Count: > 0 and <= 200 })
            return BadRequest(new { error = "Choisissez un responsable et entre 1 et 200 plans." });

        var visible = await _actionPlanService.GetVisibleIdsAsync(by, IsSuperAdmin());
        var assigned = 0;
        var skipped = 0;
        foreach (var id in dto.PlanIds.Distinct())
        {
            var plan = visible.Contains(id) ? await _actionPlanService.GetByIdAsync(id) : null;
            if (plan is null || plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived
                || string.Equals(plan.AssignedToId, dto.UserId, StringComparison.OrdinalIgnoreCase))
            {
                skipped++;
                continue;
            }

            await _actionPlanService.UpdateAsync(id, new UpdateActionPlanDto
            {
                Title = plan.Title,
                Description = plan.Description,
                Status = plan.Status,
                Type = plan.Type,
                OrganizationId = plan.OrganizationId,
                DepartmentId = plan.DepartmentId,
                AssignedToId = dto.UserId,
                Deadline = plan.Deadline,
            }, by);
            assigned++;
        }

        return Ok(new { assigned, skipped });
    }

    // ============================================================
    // ASSIGNATION
    // ============================================================
    [HttpPost("assign")]
    [Authorize]
    public async Task<IActionResult> AssignActionPlanToUser([FromBody] AssignActionPlanDto dto)
    {
        _logger.LogWarning("=== ALL CLAIMS ===");
        foreach (var claim in User.Claims)
            _logger.LogWarning("{Type} = {Value}", claim.Type, claim.Value);

        try
        {
            var currentUserId = GetCurrentUserId();
            var roles = User.FindAll("role")
                .Concat(User.FindAll(ClaimTypes.Role))
                .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant())
                .ToHashSet();
            var isAdmin = roles.Contains("admin") || roles.Contains("superadmin") || roles.Contains("admin_quality");

            // Employees may only self-assign; admins can assign anyone.
            if (!isAdmin &&
                (string.IsNullOrWhiteSpace(currentUserId) ||
                 !string.Equals(dto.UserId?.Trim(), currentUserId.Trim(), StringComparison.OrdinalIgnoreCase)))
            {
                return Forbid();
            }

            if (!Guid.TryParse(dto.UserId, out var userId))
                return BadRequest(new { error = "Format d'UserId invalide." });

            if (!Guid.TryParse(dto.ActionPlanId, out var actionPlanId))
                return BadRequest(new { error = "Format d'ActionPlanId invalide." });

            var userExists = await _userService.UserExistsAsync(userId);
            if (!userExists)
                return NotFound(new { error = "Utilisateur non trouvé." });

            var planExists = await _actionPlanService.ExistsAsync(actionPlanId);
            if (!planExists)
                return NotFound(new { error = "Plan d'action non trouvé." });

            var result = await _actionPlanService.AssignToUserAsync(dto, currentUserId);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de l'assignation du plan d'action");
            return StatusCode(500, new { error = "Une erreur est survenue lors de l'assignation." });
        }
    }

    [HttpGet("user/assigned")]
    public async Task<IActionResult> GetUserActionPlans()
    {
        try
        {
            var userId = GetCurrentUserId();  // ✅ FIXED

            if (string.IsNullOrEmpty(userId))
            {
                _logger.LogWarning("GetUserActionPlans: no userId found in claims. Claims: {Claims}",
                    string.Join(", ", User.Claims.Select(c => $"{c.Type}={c.Value}")));
                return Unauthorized(new { error = "Utilisateur non authentifié." });
            }

            var plans = await _actionPlanService.GetUserAssignedPlansAsync(userId);
            return Ok(plans);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des plans assignés");
            return StatusCode(500, new { error = "Une erreur est survenue." });
        }
    }

    /// <summary>The history of a plan the caller can see (the plan's own events and those of its sub-actions: progress, proofs, validation, rejection).</summary>
    [HttpGet("assigned/{id:guid}/history")]
    public async Task<IActionResult> GetAssignedPlanHistory(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        var visible = IsQualityAdmin() || await _actionPlanService.GetAssignedPlanByIdAsync(id, userId) != null;
        if (!visible)
            return NotFound(new { error = "Plan d'action non trouvé ou non assigné." });

        var events = (await _actionPlanService.GetAllHistoryAsync(id)).ToList();
        // people by name, never by identifier (also inside the stored notes such as "Plan auto-assigné à <id>")
        var ids = events.SelectMany(e => new[] { e.ChangedBy, e.NewAssignedToId, e.OldAssignedToId }).OfType<string>().Where(u => u.Length > 0).Distinct().ToList();
        var names = await _db.UserProfiles.AsNoTracking().Where(u => ids.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name, StringComparer.OrdinalIgnoreCase);
        foreach (var e in events)
        {
            if (string.IsNullOrWhiteSpace(e.ChangedByName) && names.TryGetValue(e.ChangedBy ?? "", out var who)) e.ChangedByName = who;
            if (e.Note is not null)
                foreach (var (userId2, name) in names)
                    e.Note = e.Note.Replace(userId2, name, StringComparison.OrdinalIgnoreCase);
        }
        return Ok(events);
    }

    [HttpGet("assigned/{id}")]
    public async Task<IActionResult> GetAssignedActionPlanById(string id)
    {
        try
        {
            if (!Guid.TryParse(id, out var planId))
                return BadRequest(new { error = "Format d'ID invalide." });

            var userId = GetCurrentUserId();  // ✅ FIXED

            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { error = "Utilisateur non authentifié." });

            var plan = await _actionPlanService.GetAssignedPlanByIdAsync(planId, userId);

            if (plan == null)
                return NotFound(new { error = "Plan d'action non trouvé ou non assigné." });

            return Ok(plan);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération du plan assigné");
            return StatusCode(500, new { error = "Une erreur est survenue." });
        }
    }

    [HttpPatch("assigned/{id}/permissions")]
    [Authorize]
    public async Task<IActionResult> UpdateAssignedPermissions(string id, [FromBody] UpdatePermissionsDto dto)
    {
        try
        {
            if (!Guid.TryParse(id, out var assignmentId))
                return BadRequest(new { error = "Format d'ID invalide." });

            var result = await _actionPlanService.UpdateAssignedPermissionsAsync(assignmentId, dto);

            if (!result)
                return NotFound(new { error = "Assignation non trouvée." });

            return Ok(new { message = "Permissions mises à jour avec succès." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la mise à jour des permissions");
            return StatusCode(500, new { error = "Une erreur est survenue." });
        }
    }

    [HttpDelete("assign")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> UnassignActionPlanFromUser([FromBody] UnassignActionPlanDto dto)
    {
        try
        {
            if (!Guid.TryParse(dto.UserId, out var userId))
                return BadRequest(new { error = "Format d'UserId invalide." });

            if (!Guid.TryParse(dto.ActionPlanId, out var actionPlanId))
                return BadRequest(new { error = "Format d'ActionPlanId invalide." });

            var result = await _actionPlanService.UnassignFromUserAsync(userId, actionPlanId);

            if (!result)
                return NotFound(new { error = "Assignation non trouvée." });

            return Ok(new { message = "Plan d'action retiré avec succès." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors du retrait du plan d'action");
            return StatusCode(500, new { error = "Une erreur est survenue." });
        }
    }

    [HttpGet("assignments")]
    [Authorize]
    public async Task<IActionResult> GetAllAssignments()
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });
        if (!IsQualityAdmin())
            return Forbid();
        try
        {
            var visible = await _actionPlanService.GetVisibleIdsAsync(userId, IsSuperAdmin());
            var assignments = await _actionPlanService.GetAllAssignmentsAsync();
            var scoped = assignments.Where(a =>
                Guid.TryParse(a.Id, out var planId) && visible.Contains(planId)).ToList();
            return Ok(scoped);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la récupération des assignations");
            return StatusCode(500, new { error = "Une erreur est survenue." });
        }
    }

    [HttpPost("{id}/close")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> CloseActionPlan(Guid id)
    {
        var userId = GetCurrentUserId() ?? "system";  // ✅ FIXED
        var circuit = await Coficab.ActionPlan.Application.Dashboard.ThresholdsStore.LoadCircuitAsync(_db, HttpContext.RequestAborted);
        if (circuit.ValidatorsSuperOnly && !IsSuperAdmin())
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Selon le circuit de validation, seul un superadmin peut clôturer un plan." });

        try
        {
            var plan = await _actionPlanService.GetByIdAsync(id);
            if (plan == null) return NotFound(new { error = "Plan non trouvé." });

            var planActions = await _planActionService.GetByActionPlanAsync(id);
            var allCompleted = planActions.All(pa =>
                pa.Progress == ActionProgress.Hundred ||
                pa.Progress == ActionProgress.Validated);

            if (!allCompleted)
                return BadRequest(new { error = "Toutes les sous-actions doivent être terminées." });
            if (circuit.RequireActionValidation && planActions.Any(pa => pa.Progress != ActionProgress.Validated))
                return BadRequest(new { error = "Toutes les sous-actions doivent être validées avant la clôture du plan." });

            var updateDto = new UpdateActionPlanDto
            {
                Title = plan.Title,
                Description = plan.Description,
                Status = ActionPlanStatus.Closed,
                Type = plan.Type,
                OrganizationId = plan.OrganizationId,
                DepartmentId = plan.DepartmentId,
                AssignedToId = plan.AssignedToId,
                Deadline = plan.Deadline
            };

            await _actionPlanService.UpdateAsync(id, updateDto, userId);

            if (!string.IsNullOrEmpty(plan.AssignedToId))
            {
                await _notificationService.NotifyAsync(
                    plan.AssignedToId,
                    "plan_validated",
                    "Plan validé",
                    $"Votre plan « {plan.Title} » a été validé par l'administrateur.",
                    id);
            }

            return Ok(new { message = "Plan clôturé avec succès." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur clôture plan {PlanId}", id);
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    [HttpPost("assigned/{id}/close")]
    [Authorize]
    public async Task<IActionResult> CloseEmptyAssignedPlan(string id)
    {
        try
        {
            if (!Guid.TryParse(id, out var planId))
                return BadRequest(new { error = "Format d'ID invalide." });

            var userId = GetCurrentUserId();  // ✅ FIXED

            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { error = "Utilisateur non authentifié." });

            await _actionPlanService.CloseEmptyAssignedPlanAsync(planId, userId);

            return Ok(new { message = "Plan marqué comme terminé, en attente de validation." });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Plan d'action non trouvé." });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur lors de la clôture du plan {PlanId}", id);
            return StatusCode(500, new { error = "Une erreur est survenue." });
        }
    }

    [HttpPatch("assigned/{id}/progress")]
    [Authorize]
    public async Task<IActionResult> UpdateAssignedPlanProgress(string id, [FromBody] UpdatePlanProgressDto dto)
    {
        if (!Guid.TryParse(id, out var planId))
            return BadRequest(new { error = "Format d'ID invalide." });

        var userId = GetCurrentUserId();  // ✅ FIXED

        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        try
        {
            await _actionPlanService.UpdateAssignedPlanProgressAsync(planId, userId, dto.Progress);
            return Ok(new { message = "Progression mise à jour." });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message }); }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetAllHistory([FromQuery] string? organizationIds = null)
    {
        if (!IsQualityAdmin())
            return Forbid();
        var history = await _actionPlanService.GetAllHistoryAsync();
        if (OrganizationFilter.Parse(organizationIds) is { } orgs)
        {
            var planIds = (await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
                _db.ActionPlans.IgnoreQueryFilters().Where(p => orgs.Contains(p.OrganizationId)).Select(p => p.Id))).Select(i => i.ToString()).ToHashSet(StringComparer.OrdinalIgnoreCase);
            history = history.Where(h => planIds.Contains(h.ActionPlanId)).ToList();
        }
        return Ok(history);
    }

    [HttpPost("{id:guid}/restore")]
    public async Task<IActionResult> Restore(Guid id)
    {
        try
        {
            var userId = GetCurrentUserId() ?? "unknown";  // ✅ FIXED
            await _actionPlanService.RestoreAsync(id, userId);
            return Ok(new { message = "Plan restauré avec succès" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("admin/assigned/{userId}")]
    [Authorize]
    public async Task<IActionResult> GetAssignedPlansForUser(string userId)
    {
        var currentUserId = GetCurrentUserId();
        if (string.IsNullOrEmpty(currentUserId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        if (!IsQualityAdmin()
            && !string.Equals(userId.Trim(), currentUserId, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        try
        {
            var plans = await _actionPlanService.GetUserAssignedPlansAsync(userId);
            return Ok(plans);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erreur GetAssignedPlansForUser");
            return StatusCode(500, new { error = "Erreur serveur." });
        }
    }

    [HttpGet("pending-validation")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> GetPendingValidation()
    {
        var plans = await _actionPlanService.GetPendingValidationAsync();
        return Ok(new { data = plans });
    }

    /// <summary>Sends a plan awaiting validation back to its assignee. The reason is required.</summary>
    [HttpPost("{id:guid}/reject")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> RejectActionPlan(Guid id, [FromBody] RejectActionPlanRequest request)
    {
        var comment = request?.Comment?.Trim();
        if (string.IsNullOrEmpty(comment))
            return BadRequest(new { error = "Le motif du renvoi est obligatoire." });
        var circuit = await Coficab.ActionPlan.Application.Dashboard.ThresholdsStore.LoadCircuitAsync(_db, HttpContext.RequestAborted);
        if (circuit.ValidatorsSuperOnly && !IsSuperAdmin())
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Selon le circuit de validation, seul un superadmin peut renvoyer un plan." });

        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        try
        {
            await _actionPlanService.RejectAsync(id, userId, comment);
            return Ok(new { message = "Plan renvoyé pour correction." });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Plan non trouvé." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Employee puts a rejected plan back into the validation queue.</summary>
    [HttpPost("assigned/{id:guid}/resubmit")]
    public async Task<IActionResult> ResubmitActionPlan(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        try
        {
            await _actionPlanService.ResubmitAsync(id, userId);
            return Ok(new { message = "Plan renvoyé en validation." });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Plan non trouvé." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Plans sent back and not yet resubmitted: the caller's own, or all visible ones for a quality admin.</summary>
    [HttpGet("rejected")]
    public async Task<IActionResult> GetRejected()
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Utilisateur non authentifié." });

        var plans = await _actionPlanService.GetRejectedAsync(userId, IsQualityAdmin(), IsSuperAdmin());
        return Ok(new { data = plans });
    }
}

public record RejectActionPlanRequest(string? Comment);