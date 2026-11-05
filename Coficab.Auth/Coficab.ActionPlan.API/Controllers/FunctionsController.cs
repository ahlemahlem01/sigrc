using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// The functions of the specification: each one belongs to a department, is linked hierarchically and functionally to other
/// functions, carries a job description (PDF or Word) and, optionally, rights. A person can hold several functions, each one
/// active, not active or by interim. Nothing is deleted: a function or a holding is archived.
/// </summary>
[ApiController]
[Route("api/functions")]
[Authorize]
public class FunctionsController : ControllerBase
{
    private static readonly string[] JobDescriptionExtensions = { ".pdf", ".doc", ".docx" };
    private const long MaxJobDescriptionBytes = 5 * 1024 * 1024;

    private readonly ActionPlanDbContext _db;
    private readonly IWebHostEnvironment _env;

    public FunctionsController(ActionPlanDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    private string CurrentUserId() => User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "system";

    private static List<string> SplitPermissions(string? raw) =>
        (raw ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    // ── functions ──────────────────────────────────────────────

    [HttpGet("permissions")]
    [Authorize(Policy = "AdminOnly")]
    public IActionResult Permissions() => Ok(PermissionAccess.Catalog.Select(p => new { code = p.Code, label = p.Label }));

    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> List([FromQuery] Guid? departmentId, CancellationToken ct)
    {
        var query = _db.Functions.AsNoTracking().Include(f => f.Department).AsQueryable();
        if (departmentId.HasValue) query = query.Where(f => f.DepartmentId == departmentId.Value);
        var functions = await query.OrderBy(f => f.Department.Name).ThenBy(f => f.FunctionCode).ToListAsync(ct);

        var counts = await _db.UserFunctions.AsNoTracking()
            .Where(uf => uf.Status != FunctionStatus.NotActive)
            .GroupBy(uf => uf.FunctionId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);

        return Ok(functions.Select(f => new
        {
            f.Id,
            code = f.FunctionCode,
            description = f.Description,
            hierarchicalLink = f.HierarchicalLink,
            functionalLink = f.FunctionalLink,
            departmentId = f.DepartmentId,
            departmentName = f.Department.Name,
            permissions = SplitPermissions(f.Permissions),
            hasJobDescription = !string.IsNullOrEmpty(f.JobDescriptionFilePath),
            jobDescriptionFileName = f.JobDescriptionFileName,
            holders = counts.TryGetValue(f.Id, out var n) ? n : 0,
        }));
    }

    public sealed class FunctionRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public Guid DepartmentId { get; set; }
        public string? HierarchicalLink { get; set; }
        public string? FunctionalLink { get; set; }
        public List<string>? Permissions { get; set; }
    }

    private async Task<string?> ValidateAsync(FunctionRequest r, Guid? selfId, CancellationToken ct)
    {
        var code = (r.Code ?? string.Empty).Trim();
        if (code.Length == 0 || code.Length > 50) return "Le code de la fonction est obligatoire (50 caractères au plus).";
        if (string.IsNullOrWhiteSpace(r.Description) || r.Description.Trim().Length > 500) return "La description est obligatoire (500 caractères au plus).";
        if (!await _db.Departments.AnyAsync(d => d.Id == r.DepartmentId, ct)) return "Le département est introuvable.";

        var duplicate = await _db.Functions.AnyAsync(f => f.DepartmentId == r.DepartmentId && f.FunctionCode.ToLower() == code.ToLower() && f.Id != selfId, ct);
        if (duplicate) return "Ce code existe déjà dans ce département.";

        foreach (var link in new[] { r.HierarchicalLink, r.FunctionalLink })
        {
            if (string.IsNullOrWhiteSpace(link)) continue;
            var wanted = link.Trim().ToLower();
            if (code.ToLower() == wanted) return "Une fonction ne peut pas être liée à elle-même.";
            if (!await _db.Functions.AnyAsync(f => f.FunctionCode.ToLower() == wanted, ct)) return $"La fonction « {link.Trim()} » n'existe pas.";
        }

        var known = PermissionAccess.Catalog.Select(p => p.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if ((r.Permissions ?? new()).Any(p => !known.Contains(p))) return "Droit inconnu.";
        return null;
    }

    private static string? LinkOrNull(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Create([FromBody] FunctionRequest request, CancellationToken ct)
    {
        if (await ValidateAsync(request, null, ct) is { } error) return BadRequest(new { message = error });
        var function = new Function
        {
            FunctionCode = request.Code.Trim(),
            Description = request.Description.Trim(),
            DepartmentId = request.DepartmentId,
            HierarchicalLink = LinkOrNull(request.HierarchicalLink),
            FunctionalLink = LinkOrNull(request.FunctionalLink),
            Permissions = request.Permissions is { Count: > 0 } ? string.Join(',', request.Permissions.Distinct(StringComparer.OrdinalIgnoreCase)) : null,
            CreatedBy = CurrentUserId(),
        };
        _db.Functions.Add(function);
        await _db.SaveChangesAsync(ct);
        return Ok(new { function.Id });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Update(Guid id, [FromBody] FunctionRequest request, CancellationToken ct)
    {
        var function = await _db.Functions.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (function == null) return NotFound();
        if (await ValidateAsync(request, id, ct) is { } error) return BadRequest(new { message = error });

        function.FunctionCode = request.Code.Trim();
        function.Description = request.Description.Trim();
        function.DepartmentId = request.DepartmentId;
        function.HierarchicalLink = LinkOrNull(request.HierarchicalLink);
        function.FunctionalLink = LinkOrNull(request.FunctionalLink);
        function.Permissions = request.Permissions is { Count: > 0 } ? string.Join(',', request.Permissions.Distinct(StringComparer.OrdinalIgnoreCase)) : null;
        function.UpdatedAt = DateTime.UtcNow;
        function.UpdatedBy = CurrentUserId();
        await _db.SaveChangesAsync(ct);
        return Ok(new { function.Id });
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        var function = await _db.Functions.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (function == null) return NotFound();
        function.IsArchived = true;
        function.ArchivedAt = DateTime.UtcNow;
        function.ArchivedBy = CurrentUserId();
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── job description ────────────────────────────────────────

    [HttpPost("{id:guid}/job-description")]
    [Authorize(Policy = "AdminOnly")]
    [RequestSizeLimit(MaxJobDescriptionBytes + 1024)]
    public async Task<IActionResult> UploadJobDescription(Guid id, IFormFile file, CancellationToken ct)
    {
        var function = await _db.Functions.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (function == null) return NotFound();
        if (file == null || file.Length == 0) return BadRequest(new { message = "Fichier requis." });
        if (file.Length > MaxJobDescriptionBytes) return BadRequest(new { message = "Le fichier dépasse 5 Mo." });
        if (!JobDescriptionExtensions.Contains(Path.GetExtension(file.FileName).ToLowerInvariant()))
            return BadRequest(new { message = "La description de poste doit être un fichier PDF ou Word.", allowed = JobDescriptionExtensions });

        function.JobDescriptionFilePath = await DocumentStorage.SaveAsync(_env, file, CurrentUserId(), ct);
        function.JobDescriptionFileName = Path.GetFileName(file.FileName);
        function.UpdatedAt = DateTime.UtcNow;
        function.UpdatedBy = CurrentUserId();
        await _db.SaveChangesAsync(ct);
        return Ok(new { fileName = function.JobDescriptionFileName });
    }

    [HttpGet("{id:guid}/job-description")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DownloadJobDescription(Guid id, CancellationToken ct)
    {
        var function = await _db.Functions.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id, ct);
        var physical = function == null ? null : DocumentStorage.Resolve(_env, function.JobDescriptionFilePath);
        if (function == null || physical == null || !System.IO.File.Exists(physical)) return NotFound();

        var name = function.JobDescriptionFileName ?? Path.GetFileName(physical);
        var type = Path.GetExtension(name).ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            _ => "application/msword",
        };
        return PhysicalFile(physical, type, name);
    }

    // ── who holds which function ───────────────────────────────

    /// <summary>People who can be given a function: the superadmin sees everyone, an administrator only his own department.</summary>
    [HttpGet("people")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> People(CancellationToken ct)
    {
        var query = _db.UserProfiles.AsNoTracking().Where(p => p.UserId != "" && p.Status != "archived");
        if (!User.IsInRole("superadmin"))
        {
            var me = CurrentUserId();
            var deptId = await _db.UserProfiles.AsNoTracking().Where(p => p.UserId == me).Select(p => p.DepartmentId).FirstOrDefaultAsync(ct);
            query = deptId == null ? query.Where(p => p.UserId == me) : query.Where(p => p.DepartmentId == deptId);
        }
        var rows = await query.OrderBy(p => p.Name).Select(p => new { id = p.UserId, name = p.Name }).ToListAsync(ct);
        return Ok(rows);
    }

    [HttpGet("assignments")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Assignments([FromQuery] Guid? functionId, [FromQuery] string? userId, CancellationToken ct)
    {
        var query = _db.UserFunctions.AsNoTracking().Include(uf => uf.Function).AsQueryable();
        if (functionId.HasValue) query = query.Where(uf => uf.FunctionId == functionId.Value);
        if (!string.IsNullOrWhiteSpace(userId)) query = query.Where(uf => uf.UserId == userId);
        var rows = await query.OrderBy(uf => uf.HireDate).ToListAsync(ct);

        var ids = rows.Select(r => r.UserId).Distinct().ToList();
        var names = await _db.UserProfiles.AsNoTracking().Where(p => ids.Contains(p.UserId)).ToDictionaryAsync(p => p.UserId, p => p.Name, ct);
        return Ok(rows.Select(r => new
        {
            r.Id,
            r.UserId,
            userName = names.TryGetValue(r.UserId, out var n) ? n : r.UserId,
            r.FunctionId,
            functionCode = r.Function.FunctionCode,
            functionDescription = r.Function.Description,
            status = r.Status.ToString(),
            startDate = r.HireDate,
        }));
    }

    public sealed class AssignmentRequest
    {
        public string UserId { get; set; } = string.Empty;
        public Guid FunctionId { get; set; }
        public string Status { get; set; } = nameof(FunctionStatus.Active);
        public DateTime? StartDate { get; set; }
    }

    private static bool TryStatus(string? raw, out FunctionStatus status) =>
        Enum.TryParse(raw, true, out status) && Enum.IsDefined(status);

    [HttpPost("assignments")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Assign([FromBody] AssignmentRequest request, CancellationToken ct)
    {
        if (!TryStatus(request.Status, out var status)) return BadRequest(new { message = "Statut inconnu (Active, NotActive ou ByInterim)." });
        if (!await _db.UserProfiles.AnyAsync(p => p.UserId == request.UserId, ct)) return BadRequest(new { message = "Employé introuvable." });
        if (!await _db.Functions.AnyAsync(f => f.Id == request.FunctionId, ct)) return BadRequest(new { message = "Fonction introuvable." });
        if (await _db.UserFunctions.AnyAsync(uf => uf.UserId == request.UserId && uf.FunctionId == request.FunctionId, ct))
            return BadRequest(new { message = "Cet employé a déjà cette fonction : modifiez son statut." });

        var row = new UserFunction
        {
            UserId = request.UserId,
            FunctionId = request.FunctionId,
            Status = status,
            HireDate = DateTime.SpecifyKind((request.StartDate ?? DateTime.UtcNow).Date, DateTimeKind.Utc),
            CreatedBy = CurrentUserId(),
        };
        _db.UserFunctions.Add(row);
        await _db.SaveChangesAsync(ct);
        return Ok(new { row.Id });
    }

    public sealed class StatusRequest
    {
        public string Status { get; set; } = string.Empty;
    }

    [HttpPut("assignments/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] StatusRequest request, CancellationToken ct)
    {
        if (!TryStatus(request.Status, out var status)) return BadRequest(new { message = "Statut inconnu (Active, NotActive ou ByInterim)." });
        var row = await _db.UserFunctions.FirstOrDefaultAsync(uf => uf.Id == id, ct);
        if (row == null) return NotFound();
        row.Status = status;
        row.UpdatedAt = DateTime.UtcNow;
        row.UpdatedBy = CurrentUserId();
        await _db.SaveChangesAsync(ct);
        return Ok(new { row.Id, status = row.Status.ToString() });
    }

    [HttpDelete("assignments/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Unassign(Guid id, CancellationToken ct)
    {
        var row = await _db.UserFunctions.FirstOrDefaultAsync(uf => uf.Id == id, ct);
        if (row == null) return NotFound();
        row.IsArchived = true;
        row.ArchivedAt = DateTime.UtcNow;
        row.ArchivedBy = CurrentUserId();
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>The functions of the signed-in person and the rights they carry.</summary>
    [HttpGet("me")]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var id = CurrentUserId();
        var rows = await _db.UserFunctions.AsNoTracking().Include(uf => uf.Function).Where(uf => uf.UserId == id).ToListAsync(ct);
        var permissions = rows.Where(r => r.Status != FunctionStatus.NotActive).SelectMany(r => SplitPermissions(r.Function.Permissions)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        return Ok(new
        {
            functions = rows.Select(r => new { r.Function.FunctionCode, r.Function.Description, status = r.Status.ToString() }),
            permissions,
        });
    }
}
