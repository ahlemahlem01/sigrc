using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Coficab.Auth.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using OpenIddict.Validation.AspNetCore;
using System.Security.Cryptography;

namespace Coficab.Auth.API.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "superadmin,admin",
    AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
public class AdminController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<IdentityRole> _roleManager;
    private readonly AppDbContext _db;
    private readonly EmailService _emailService;
    private readonly AuditService _auditService;
    private readonly IOpenIddictTokenManager _tokenManager;

    public AdminController(
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager,
        AppDbContext db,
        EmailService emailService,
        AuditService auditService,
        IOpenIddictTokenManager tokenManager)
    {
        _userManager = userManager;
        _roleManager = roleManager;
        _db = db;
        _emailService = emailService;
        _auditService = auditService;
        _tokenManager = tokenManager;
    }

    // ─── Helpers ──────────────────────────────────────────────

    private string CurrentUserId =>
        User.GetClaim(OpenIddictConstants.Claims.Subject) ?? "";

    private string CurrentUserEmail =>
        User.GetClaim(OpenIddictConstants.Claims.Email) ?? "unknown";

    private bool CallerIsSuperadmin =>
        User.IsInRole("superadmin");

    private async Task<Guid?> GetCallerOrgIdAsync()
    {
        if (CallerIsSuperadmin) return null;
        var caller = await _userManager.FindByIdAsync(CurrentUserId);
        return caller?.OrganizationId;
    }

    private static string? ValidateRoleScoping(string role, Guid? organizationId, Guid? departmentId)
    {
        // an administrator, whatever the level, works for an organization and in one of its departments
        if (role is "admin" or "superadmin")
        {
            if (organizationId == null)
                return "An administrator must be assigned to an organization.";
            if (departmentId == null)
                return "An administrator must belong to a department of that organization.";
        }

        return null;
    }

    /// <summary>
    /// The department of the organization the person belongs to: it must exist (and not be archived) and, when an
    /// organization is given, belong to it. Returns its name, which is kept in Department for display.
    /// </summary>
    private async Task<(string? Name, string? Error)> ResolveDepartmentAsync(Guid? organizationId, Guid? departmentId, string fallbackName)
    {
        if (departmentId == null) return (fallbackName, null);

        // the departments live in the action plan schema of the same database
        var name = organizationId is { } org
            ? await _db.Database.SqlQuery<string>($"SELECT Name AS Value FROM actionplan.Departments WHERE Id = {departmentId} AND IsArchived = 0 AND OrganizationId = {org}").FirstOrDefaultAsync()
            : await _db.Database.SqlQuery<string>($"SELECT Name AS Value FROM actionplan.Departments WHERE Id = {departmentId} AND IsArchived = 0").FirstOrDefaultAsync();
        return name == null ? (null, "This department does not exist in the chosen organization.") : (name, null);
    }

    /// <summary>Keeps the person's profile (used by the organization scope) in the same department as the account.</summary>
    private async Task SyncProfileDepartmentAsync(ApplicationUser user, string role, Guid? departmentId)
    {
        if (departmentId == null) return;
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.UserProfiles SET DepartmentId = {departmentId}, UpdatedAt = SYSUTCDATETIME() WHERE UserId = {user.Id}");
        if (role is "admin" or "superadmin")
        {
            await _db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO actionplan.UserProfiles (Id, UserId, Name, Email, Role, Poste, Equipe, DepartmentId, HireDate, Status, ActivityStatus, CreatedAt)
                SELECT NEWID(), {user.Id}, {user.FullName}, {user.Email}, {role}, 'Administrateur', {user.Department}, {departmentId}, SYSUTCDATETIME(), 'active', 0, SYSUTCDATETIME()
                WHERE NOT EXISTS (SELECT 1 FROM actionplan.UserProfiles WHERE UserId = {user.Id})");
        }
    }

    /// <summary>
    /// Cryptographically secure password that satisfies Identity default complexity.
    /// </summary>
    private static string GenerateSecurePassword(int length = 16)
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghjkmnpqrstuvwxyz";
        const string digits = "23456789";
        const string special = "!@#$%^&*()-_=+[]{}";
        const string all = upper + lower + digits + special;

        var password = new char[length];
        password[0] = upper[RandomNumberGenerator.GetInt32(upper.Length)];
        password[1] = lower[RandomNumberGenerator.GetInt32(lower.Length)];
        password[2] = digits[RandomNumberGenerator.GetInt32(digits.Length)];
        password[3] = special[RandomNumberGenerator.GetInt32(special.Length)];

        for (int i = 4; i < length; i++)
            password[i] = all[RandomNumberGenerator.GetInt32(all.Length)];

        RandomNumberGenerator.Shuffle(password.AsSpan());
        return new string(password);
    }

    /// <summary>
    /// Revokes all active tokens (access + refresh) issued to a user, so a
    /// lock/lockout takes effect immediately instead of waiting for token expiry.
    /// </summary>
    private async Task RevokeAllTokensForUserAsync(string userId)
    {
        await foreach (var token in _tokenManager.FindBySubjectAsync(userId))
        {
            await _tokenManager.TryRevokeAsync(token);
        }
    }

    // ─── GET /api/admin/users ─────────────────────────────────

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] string? organizationIds = null)
    {
        IQueryable<ApplicationUser> query = _userManager.Users;

        if (!CallerIsSuperadmin)
        {
            var callerOrgId = await GetCallerOrgIdAsync();
            if (callerOrgId == null) return Forbid();
            query = query.Where(u => u.OrganizationId == callerOrgId);
        }
        else if (ParseOrganizations(organizationIds) is { } followed)
        {
            // the superadmin follows some organizations: their people only
            query = query.Where(u => u.OrganizationId != null && followed.Contains(u.OrganizationId.Value));
        }

        var users = await query.ToListAsync();
        var userIds = users.Select(u => u.Id).ToList();

        var roleRows = await (
            from link in _db.Set<Microsoft.AspNetCore.Identity.IdentityUserRole<string>>()
            join role in _db.Roles on link.RoleId equals role.Id
            where userIds.Contains(link.UserId)
            select new { link.UserId, role.Name }
        ).ToListAsync();

        var permissionRows = await _db.UserPermissions
            .Where(up => userIds.Contains(up.UserId) && up.IsGranted && up.Permission != null)
            .Select(up => new { up.UserId, up.Permission.Name })
            .ToListAsync();

        var rolesByUser = roleRows
            .GroupBy(r => r.UserId)
            .ToDictionary(g => g.Key, g => g.Select(r => r.Name).Where(n => n != null).Cast<string>().ToList());
        var permissionsByUser = permissionRows
            .GroupBy(p => p.UserId)
            .ToDictionary(g => g.Key, g => g.Select(p => p.Name).ToList());

        var result = users.Select(user => new
        {
            user.Id,
            user.Email,
            user.FullName,
            user.Department,
            user.DepartmentId,
            user.OrganizationId,
            user.LockoutEnd,
            user.AccessFailedCount,
            user.LastLoginAt,
            IsLockedOut = user.LockoutEnd.HasValue && user.LockoutEnd > DateTimeOffset.UtcNow,
            Roles = rolesByUser.TryGetValue(user.Id, out var roles) ? roles : new List<string>(),
            Permissions = permissionsByUser.TryGetValue(user.Id, out var permissions) ? permissions : new List<string>(),
            // what the role gives by itself: shown as granted in the matrix, and not removable there
            InheritedPermissions = Coficab.Auth.API.Data.RolePermissionDefaults.For(rolesByUser.TryGetValue(user.Id, out var roleNames) ? roleNames : new List<string>()),
            CreatedAt = (DateTimeOffset?)null,
        }).ToList();

        return Ok(result);
    }

    // ─── GET /api/admin/permissions ───────────────────────────

    [HttpGet("permissions")]
    public async Task<IActionResult> GetPermissions()
    {
        var permissions = await _db.Permissions
            .Where(p => p.IsActive)
            .ToListAsync();
        permissions = permissions.Where(p => ProjectPermissionCatalog.IsSupported(p.Name)).ToList();
        return Ok(permissions);
    }

    /// <summary>"id1,id2" from the organization selector; null when empty or invalid (every organization).</summary>
    private static IReadOnlyList<Guid>? ParseOrganizations(string? raw)
    {
        var ids = (raw ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var g) ? g : (Guid?)null).Where(g => g != null).Select(g => g!.Value).Distinct().ToList();
        return ids.Count == 0 ? null : ids;
    }

    // ─── GET /api/admin/audit-logs ────────────────────────────

    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs([FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? organizationIds = null)
    {
        IQueryable<AuditLog> source = _db.AuditLogs;
        if (CallerIsSuperadmin && ParseOrganizations(organizationIds) is { } followed)
        {
            // an entry belongs to an organization through the person who did it or the person it is about
            var people = await _userManager.Users.Where(u => u.OrganizationId != null && followed.Contains(u.OrganizationId.Value))
                .Select(u => new { u.Id, u.Email }).ToListAsync();
            var ids = people.Select(p => p.Id).ToList();
            var emails = people.Where(p => p.Email != null).Select(p => p.Email!.ToLower()).ToList();
            source = source.Where(a => (a.ActorId != null && ids.Contains(a.ActorId)) || emails.Contains(a.TargetEmail.ToLower()) || emails.Contains(a.ActorEmail.ToLower()));
        }

        var total = await source.CountAsync();
        var logs = await source
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new { total, page, pageSize, logs });
    }

    // ─── POST /api/admin/users/{id}/merge-into/{targetId} ─────

    /// <summary>
    /// Two accounts of the same person: the work (plans, actions, claims, 8D, plan permissions, badges, timeline) moves to
    /// the kept account, the other one is locked for good (never deleted) and linked to it, so that the history it
    /// signed ("created by", "modified by") shows the kept account's name.
    /// </summary>
    [HttpPost("users/{id}/merge-into/{targetId}")]
    [Authorize(Roles = "superadmin",
        AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
    public async Task<IActionResult> MergeUsers(string id, string targetId)
    {
        if (string.Equals(id, targetId, StringComparison.OrdinalIgnoreCase))
            return BadRequest("An account cannot be merged into itself.");
        var old = await _userManager.FindByIdAsync(id);
        var kept = await _userManager.FindByIdAsync(targetId);
        if (old == null || kept == null) return NotFound();
        if (await _userManager.IsLockedOutAsync(kept))
            return BadRequest("The account to keep must be active.");

        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.ActionPlans SET AssignedToId = {targetId} WHERE AssignedToId = {id}");
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.ActionPlans SET OwnerId = {targetId} WHERE OwnerId = {id}");
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.PlanActions SET AssignedToId = {targetId} WHERE AssignedToId = {id}");
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.Claims SET AssignedToId = {targetId} WHERE AssignedToId = {id}");
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.EightDDossiers SET ChampionId = {targetId} WHERE ChampionId = {id}");
        // plan permissions: unless the kept account already has a row for that plan
        await _db.Database.ExecuteSqlInterpolatedAsync($@"UPDATE a SET UserId = {targetId} FROM actionplan.UserActionPlanAssignments a
            WHERE a.UserId = {id} AND NOT EXISTS (SELECT 1 FROM actionplan.UserActionPlanAssignments b WHERE b.UserId = {targetId} AND b.ActionPlanId = a.ActionPlanId)");
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.Badges SET UserId = {targetId} WHERE UserId = {id}");
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.TimelineEvents SET UserId = {targetId} WHERE UserId = {id}");
        // the old id stays in the history it signed; the alias makes every screen show the kept account's name for it
        await _db.Database.ExecuteSqlInterpolatedAsync($@"IF EXISTS (SELECT 1 FROM actionplan.UserAliases WHERE OldUserId = {id})
            UPDATE actionplan.UserAliases SET UserId = {targetId}, MergedAt = SYSUTCDATETIME(), MergedBy = {CurrentUserId} WHERE OldUserId = {id}
            ELSE INSERT INTO actionplan.UserAliases (OldUserId, UserId, MergedAt, MergedBy) VALUES ({id}, {targetId}, SYSUTCDATETIME(), {CurrentUserId})");
        // accounts that were already merged into the old one now point to the kept one
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.UserAliases SET UserId = {targetId} WHERE UserId = {id}");
        await _db.Database.ExecuteSqlInterpolatedAsync($"UPDATE actionplan.UserProfiles SET Status = 'inactive', UpdatedAt = SYSUTCDATETIME() WHERE UserId = {id}");
        await _userManager.SetLockoutEnabledAsync(old, true);
        await _userManager.SetLockoutEndDateAsync(old, DateTimeOffset.MaxValue);
        await tx.CommitAsync();

        await _auditService.LogAsync(
            action: "MERGE",
            targetEmail: old.Email!,
            actorId: CurrentUserId,
            actorEmail: CurrentUserEmail,
            detail: $"Merged into {kept.Email}");
        return Ok(new { mergedInto = kept.Email });
    }

    // ─── POST /api/admin/users ────────────────────────────────

    [HttpPost("users")]
    [Authorize(Roles = "superadmin",
        AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
    public async Task<IActionResult> CreateUser([FromBody] AdminCreateUserRequest request)
    {
        if (string.IsNullOrEmpty(CurrentUserId))
            return BadRequest("Cannot resolve current user ID.");

        var created = await TryCreateUserAsync(request);
        if (created.Error != null)
            return BadRequest(created.Error);

        return Ok(new { created.Id, created.Email, created.FullName, created.OrganizationId });
    }

    /// <summary>
    /// CSV des employés. Colonnes : FullName, Email, Department, Role, Poste, Equipe.
    /// Role vaut user par défaut.
    /// </summary>
    [HttpPost("users/import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> ImportUsers(IFormFile file, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(CurrentUserId))
            return BadRequest("Cannot resolve current user ID.");

        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Fichier CSV requis." });

        string text;
        using (var reader = new StreamReader(file.OpenReadStream()))
            text = await reader.ReadToEndAsync(cancellationToken);

        var rows = ParseEmployeeCsv(text);
        if (rows.Count == 0)
            return BadRequest(new { message = "Aucune ligne à importer. En-tête attendu : Nom complet, E-mail, Département, Rôle, Poste, Équipe." });
        if (rows.Count > 300)
            return BadRequest(new { message = "Maximum 300 employés par fichier." });

        var created = new List<object>();
        var errors = new List<object>();
        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            if (string.IsNullOrWhiteSpace(row.FullName) || string.IsNullOrWhiteSpace(row.Email))
            {
                errors.Add(new { line = i + 2, message = "FullName et Email sont requis." });
                continue;
            }

            var role = string.IsNullOrWhiteSpace(row.Role) ? "user" : row.Role.Trim().ToLowerInvariant();
            if (role is not ("user" or "admin" or "superadmin"))
            {
                errors.Add(new { line = i + 2, message = "Role invalide. Valeurs : user, admin, superadmin." });
                continue;
            }

            if (!CallerIsSuperadmin && role is "admin" or "superadmin")
            {
                errors.Add(new { line = i + 2, message = "Seul un superadmin peut créer un admin ou un superadmin." });
                continue;
            }

            var result = await TryCreateUserAsync(new AdminCreateUserRequest
            {
                Email = row.Email.Trim(),
                FullName = row.FullName.Trim(),
                Department = row.Department?.Trim() ?? "",
                Role = role,
                Permissions = []
            });

            if (result.Error != null)
            {
                errors.Add(new { line = i + 2, message = result.Error });
                continue;
            }

            created.Add(new
            {
                id = result.Id,
                email = result.Email,
                fullName = result.FullName,
                role,
                department = row.Department?.Trim() ?? "",
                poste = row.Poste?.Trim() ?? "",
                equipe = row.Equipe?.Trim() ?? ""
            });
        }

        return Ok(new { created = created.Count, users = created, errors });
    }

    private async Task<UserCreateOutcome> TryCreateUserAsync(AdminCreateUserRequest request)
    {
        if (string.IsNullOrEmpty(CurrentUserId))
            return new UserCreateOutcome("Cannot resolve current user ID.", null, null, null, null);

        var scopingError = ValidateRoleScoping(request.Role, request.OrganizationId, request.DepartmentId);
        if (scopingError != null)
            return new UserCreateOutcome(scopingError, null, null, null, null);
        var (departmentName, departmentError) = await ResolveDepartmentAsync(request.OrganizationId, request.DepartmentId, request.Department);
        if (departmentError != null)
            return new UserCreateOutcome(departmentError, null, null, null, null);

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FullName = request.FullName,
            Department = departmentName ?? string.Empty,
            DepartmentId = request.DepartmentId,
            OrganizationId = request.OrganizationId
        };

        var temporaryPassword = GenerateSecurePassword();
        var result = await _userManager.CreateAsync(user, temporaryPassword);
        if (!result.Succeeded)
            return new UserCreateOutcome(result.Errors.First().Description, null, null, null, null);

        if (!string.IsNullOrEmpty(request.Role))
            await _userManager.AddToRoleAsync(user, request.Role);
        await SyncProfileDepartmentAsync(user, request.Role, request.DepartmentId);

        if (request.Permissions?.Any() == true)
        {
            foreach (var permName in request.Permissions)
            {
                var perm = await _db.Permissions.FirstOrDefaultAsync(p => p.Name == permName);
                if (perm != null)
                    _db.UserPermissions.Add(new UserPermission
                    {
                        UserId = user.Id,
                        PermissionId = perm.Id,
                        IsGranted = true,
                        GrantedById = CurrentUserId
                    });
            }
            await _db.SaveChangesAsync();
        }

        try
        {
            await _emailService.SendWelcomeEmailAsync(user.Email!, user.FullName, temporaryPassword);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(
                $"[AdminController] Welcome email failed for {user.Email}: {ex.Message}");
        }

        await _auditService.LogAsync(
            action: "CREATE",
            targetEmail: user.Email!,
            actorId: CurrentUserId,
            actorEmail: CurrentUserEmail,
            detail: $"Role: {request.Role}, Department: {request.Department}");

        return new UserCreateOutcome(null, user.Id, user.Email, user.FullName, user.OrganizationId);
    }

    private sealed record UserCreateOutcome(string? Error, string? Id, string? Email, string? FullName, Guid? OrganizationId);

    private sealed record CsvEmployeeRow(string FullName, string Email, string? Department, string? Role, string? Poste, string? Equipe);

    private static List<CsvEmployeeRow> ParseEmployeeCsv(string text)
    {
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length < 2) return [];

        var delimiter = lines[0].Contains(';') && !lines[0].Contains(',') ? ';' : ',';
        var header = SplitCsvLine(lines[0], delimiter)
            .Select(h => h.Trim().Trim('"').ToLowerInvariant())
            .ToList();
        int Index(params string[] names)
        {
            foreach (var name in names)
            {
                var wanted = name.Trim().TrimStart('\uFEFF').ToLowerInvariant();
                var index = header.FindIndex(cell => cell.Trim().TrimStart('\uFEFF') == wanted);
                if (index >= 0) return index;
            }
            return -1;
        }
        var iName = Index("fullname", "nom complet", "nom");
        var iEmail = Index("email", "e-mail", "courriel");
        var iDept = Index("department", "département", "departement");
        var iRole = Index("role", "rôle");
        var iPoste = Index("poste");
        var iEquipe = Index("equipe", "équipe");
        if (iName < 0 || iEmail < 0) return [];

        string? Cell(IReadOnlyList<string> cells, int index) =>
            index >= 0 && index < cells.Count ? cells[index] : null;

        var rows = new List<CsvEmployeeRow>();
        for (var i = 1; i < lines.Length; i++)
        {
            var cells = SplitCsvLine(lines[i], delimiter);
            if (cells.All(string.IsNullOrWhiteSpace)) continue;
            var fullName = Cell(cells, iName) ?? "";
            if (fullName.Trim().StartsWith("EXEMPLE", StringComparison.OrdinalIgnoreCase)) continue;
            rows.Add(new CsvEmployeeRow(
                Cell(cells, iName) ?? "",
                Cell(cells, iEmail) ?? "",
                Cell(cells, iDept),
                Cell(cells, iRole),
                Cell(cells, iPoste),
                Cell(cells, iEquipe)));
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

    // ─── PUT /api/admin/users/{id} ────────────────────────────

    [HttpPut("users/{id}")]
    public async Task<IActionResult> UpdateUser(string id, [FromBody] AdminUpdateUserRequest request)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound();

        if (!CallerIsSuperadmin)
        {
            var callerOrgId = await GetCallerOrgIdAsync();
            if (callerOrgId == null || user.OrganizationId != callerOrgId)
                return Forbid();

            if (request.Role is "admin" or "superadmin")
                return BadRequest("You do not have permission to assign this role.");
        }

        var scopingError = ValidateRoleScoping(request.Role, request.OrganizationId, request.DepartmentId);
        if (scopingError != null) return BadRequest(scopingError);
        var (departmentName, departmentError) = await ResolveDepartmentAsync(request.OrganizationId, request.DepartmentId, request.Department);
        if (departmentError != null) return BadRequest(departmentError);
        request.Department = departmentName ?? string.Empty;

        // Build detail string before overwriting
        var changes = new List<string>();
        if (user.FullName != request.FullName) changes.Add($"FullName: {user.FullName} → {request.FullName}");
        if (user.Department != request.Department) changes.Add($"Department: {user.Department} → {request.Department}");

        var oldRoles = await _userManager.GetRolesAsync(user);
        var oldRole = oldRoles.FirstOrDefault() ?? "none";
        if (oldRole != request.Role) changes.Add($"Role: {oldRole} → {request.Role}");

        user.FullName = request.FullName;
        user.Department = request.Department;
        user.DepartmentId = request.DepartmentId;
        user.OrganizationId = request.OrganizationId;
        await _userManager.UpdateAsync(user);
        await SyncProfileDepartmentAsync(user, request.Role, request.DepartmentId);

        await _userManager.RemoveFromRolesAsync(user, oldRoles);
        if (!string.IsNullOrEmpty(request.Role))
            await _userManager.AddToRoleAsync(user, request.Role);

        var existing = _db.UserPermissions.Where(up => up.UserId == id);
        _db.UserPermissions.RemoveRange(existing);

        if (request.Permissions?.Any() == true)
        {
            foreach (var permName in request.Permissions)
            {
                var perm = await _db.Permissions.FirstOrDefaultAsync(p => p.Name == permName);
                if (perm != null)
                    _db.UserPermissions.Add(new UserPermission
                    {
                        UserId = user.Id,
                        PermissionId = perm.Id,
                        IsGranted = true,
                        GrantedById = CurrentUserId
                    });
            }
        }

        if (request.Permissions != null)
        {
            var permLabel = request.Permissions.Any()
                ? string.Join(", ", request.Permissions)
                : "(aucune)";
            changes.Add($"Permissions: → [{permLabel}]");
        }

        await _db.SaveChangesAsync();

        await _auditService.LogAsync(
            action: "UPDATE",
            targetEmail: user.Email!,
            actorId: CurrentUserId,
            actorEmail: CurrentUserEmail,
            detail: changes.Any() ? string.Join("; ", changes) : "No field changes");

        return Ok();
    }

    // ─── DELETE /api/admin/users/{id} ────────────────────────

    [HttpDelete("users/{id}")]
    [Authorize(Roles = "superadmin",
        AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
    public async Task<IActionResult> DeleteUser(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound();

        if (user.Id == CurrentUserId)
            return BadRequest("You cannot delete your own account.");

        var userRoles = await _userManager.GetRolesAsync(user);
        if (userRoles.Contains("superadmin"))
        {
            var superadminCount = (await _userManager.GetUsersInRoleAsync("superadmin")).Count;
            if (superadminCount <= 1)
                return BadRequest("Cannot delete the last superadmin account.");
        }

        var email = user.Email!;
        await _userManager.DeleteAsync(user);

        await _auditService.LogAsync(
            action: "DELETE",
            targetEmail: email,
            actorId: CurrentUserId,
            actorEmail: CurrentUserEmail,
            detail: $"Roles: {string.Join(", ", userRoles)}");

        return Ok();
    }

    // ─── POST /api/admin/users/{id}/reset-password ────────────

    [HttpPost("users/{id}/reset-password")]
    [Authorize(Roles = "superadmin",
        AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
    public async Task<IActionResult> ResetPassword(string id, [FromBody] AdminResetPasswordRequest request)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound();

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, token, request.NewPassword);

        if (!result.Succeeded)
            return BadRequest(result.Errors.First().Description);

        await _auditService.LogAsync(
            action: "RESET_PASSWORD",
            targetEmail: user.Email!,
            actorId: CurrentUserId,
            actorEmail: CurrentUserEmail,
            detail: $"Mot de passe réinitialisé par {CurrentUserEmail}");

        return Ok();
    }

    // ─── POST /api/admin/users/{id}/unlock ───────────────────

    [HttpPost("users/{id}/unlock")]
    public async Task<IActionResult> UnlockUser(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound();

        if (!CallerIsSuperadmin)
        {
            var callerOrgId = await GetCallerOrgIdAsync();
            if (callerOrgId == null || user.OrganizationId != callerOrgId)
                return Forbid();
        }

        await _userManager.SetLockoutEndDateAsync(user, null);
        await _userManager.ResetAccessFailedCountAsync(user);

        await _auditService.LogAsync(
            action: "UNLOCK",
            targetEmail: user.Email!,
            actorId: CurrentUserId,
            actorEmail: CurrentUserEmail,
            detail: $"Compte déverrouillé par {CurrentUserEmail}");

        return Ok();
    }

    // ─── POST /api/admin/users/{id}/lock ──────────────────────

    [HttpPost("users/{id}/lock")]
    public async Task<IActionResult> LockUser(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound();

        if (user.Id == CurrentUserId)
            return BadRequest("You cannot lock your own account.");

        var targetRoles = await _userManager.GetRolesAsync(user);
        if (targetRoles.Contains("superadmin"))
        {
            var superadminCount = (await _userManager.GetUsersInRoleAsync("superadmin")).Count;
            if (superadminCount <= 1)
                return BadRequest("Cannot lock the last superadmin account.");
        }

        if (!CallerIsSuperadmin)
        {
            var callerOrgId = await GetCallerOrgIdAsync();
            if (callerOrgId == null || user.OrganizationId != callerOrgId)
                return Forbid();
        }

        if (!await _userManager.GetLockoutEnabledAsync(user))
            await _userManager.SetLockoutEnabledAsync(user, true);

        await _userManager.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue);

        // Revoke active tokens so the lock takes effect immediately, not just
        // at next login/refresh. Safe with UseLocalServer(), which checks
        // token status on every request.
        await RevokeAllTokensForUserAsync(user.Id);

        await _auditService.LogAsync(
            action: "LOCK",
            targetEmail: user.Email!,
            actorId: CurrentUserId,
            actorEmail: CurrentUserEmail,
            detail: $"Compte verrouillé manuellement par {CurrentUserEmail}");

        return Ok();
    }
}

// ─── Request models ───────────────────────────────────────────

public class AdminCreateUserRequest
{
    public string Email { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Department { get; set; } = "";
    /// <summary>The department (of the organization) the person belongs to; its name is then stored in Department.</summary>
    public Guid? DepartmentId { get; set; }
    // Password removed — generated on the backend
    public string Role { get; set; } = "";
    public Guid? OrganizationId { get; set; }
    public List<string>? Permissions { get; set; }
}

public class AdminUpdateUserRequest
{
    public string FullName { get; set; } = "";
    public string Department { get; set; } = "";
    public Guid? DepartmentId { get; set; }
    public string Role { get; set; } = "";
    public Guid? OrganizationId { get; set; }
    public List<string>? Permissions { get; set; }
}

public class AdminResetPasswordRequest
{
    public string NewPassword { get; set; } = "";
}