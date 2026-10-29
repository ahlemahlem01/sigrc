using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Validation.AspNetCore;

namespace Coficab.Auth.API.Controllers;

[ApiController]
[Route("api/permissions")]
[Authorize(AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
public class PermissionController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public PermissionController(AppDbContext db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    // GET api/permissions — toutes les permissions
    [HttpGet]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> GetAll()
    {
        var permissions = (await _db.Permissions
            .OrderBy(p => p.Category)
            .ThenBy(p => p.Name)
            .ToListAsync())
            .Where(p => ProjectPermissionCatalog.IsSupported(p.Name))
            .Select(p => new
            {
                p.Id,
                p.Name,
                p.DisplayName,
                p.Description,
                p.Category,
                p.AppId,
                p.IsDefault,
                p.IsActive,
                p.CreatedAt
            });

        return Ok(permissions);
    }

    // GET api/permissions/{appId} — permissions par app
    [HttpGet("{appId}")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> GetByApp(string appId)
    {
        var permissions = await _db.Permissions
            .Where(p => p.AppId == appId)
            .OrderBy(p => p.Name)
            .Select(p => new
            {
                p.Id,
                p.Name,
                p.DisplayName,
                p.Description,
                p.AppId,
                p.IsDefault
            })
            .ToListAsync();

        return Ok(permissions);
    }

    // GET api/permissions/available-codes — the rights the project can enforce that are not created yet (the form offers these)
    [HttpGet("available-codes")]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> AvailableCodes()
    {
        var existing = await _db.Permissions.Select(p => p.Name).ToListAsync();
        var left = ProjectPermissionCatalog.Names
            .Where(name => !existing.Contains(name, StringComparer.OrdinalIgnoreCase))
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        return Ok(left);
    }

    // POST api/permissions — créer une permission custom
    [HttpPost]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> Create([FromBody] CreatePermissionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Category))
            return BadRequest(new { message = "Le code et la catégorie sont requis." });

        if (!ProjectPermissionCatalog.IsSupported(request.Name))
            return BadRequest(new { message = ProjectPermissionCatalog.RejectionMessage });

        if (await _db.Permissions.AnyAsync(p => p.Name == request.Name))
            return BadRequest(new { message = "Ce code existe déjà." });

        var permission = new Permission
        {
            Name = request.Name.Trim(),
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? request.Name.Trim() : request.DisplayName.Trim(),
            Description = request.Description?.Trim() ?? "",
            Category = request.Category.Trim(),
            AppId = string.IsNullOrWhiteSpace(request.AppId) ? PermissionCategories.AppIdForCategory(request.Category) : request.AppId.Trim(),
            IsDefault = false,
            IsActive = true
        };

        await _db.Permissions.AddAsync(permission);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Permission créée.", permissionId = permission.Id });
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdatePermissionRequest request)
    {
        var permission = await _db.Permissions.FindAsync(id);
        if (permission == null)
            return NotFound(new { message = "Permission introuvable." });

        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(request.Category))
            return BadRequest(new { message = "Le code et la catégorie sont requis." });

        if (!ProjectPermissionCatalog.IsSupported(name))
            return BadRequest(new { message = ProjectPermissionCatalog.RejectionMessage });

        if (await _db.Permissions.AnyAsync(p => p.Name == name && p.Id != id))
            return BadRequest(new { message = "Ce code existe déjà." });

        permission.Name = name;
        permission.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? name : request.DisplayName.Trim();
        permission.Description = request.Description?.Trim() ?? "";
        permission.Category = request.Category.Trim();
        if (!string.IsNullOrWhiteSpace(request.AppId))
            permission.AppId = request.AppId.Trim();

        await _db.SaveChangesAsync();
        return Ok(new { message = "Permission mise à jour." });
    }

    [HttpPatch("{id}/active")]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> SetActive(string id, [FromBody] SetPermissionActiveRequest request)
    {
        var permission = await _db.Permissions.FindAsync(id);
        if (permission == null)
            return NotFound(new { message = "Permission introuvable." });

        permission.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { message = request.IsActive ? "Permission réactivée." : "Permission désactivée." });
    }

    // DELETE api/permissions/{id} — supprimer une permission custom
    [HttpDelete("{id}")]
    [Authorize(Roles = "superadmin")]
    public async Task<IActionResult> Delete(string id)
    {
        var permission = await _db.Permissions.FindAsync(id);
        if (permission == null)
            return NotFound(new { message = "Permission not found" });

        if (permission.IsDefault)
            return BadRequest(new { message = "Cannot delete a default permission" });

        _db.Permissions.Remove(permission);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Permission deleted successfully" });
    }

    // GET api/permissions/users/{userId} — permissions d'un user
    [HttpGet("users/{userId}")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> GetUserPermissions(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
            return NotFound(new { message = "User not found" });

        var permissions = await _db.UserPermissions
            .Include(up => up.Permission)
            .Where(up => up.UserId == userId && up.IsGranted)
            .Select(up => new
            {
                up.Id,
                up.Permission.Name,
                up.Permission.DisplayName,
                up.Permission.AppId,
                up.IsGranted,
                up.GrantedAt
            })
            .ToListAsync();

        return Ok(permissions);
    }

    // POST api/permissions/users/{userId} — assigner permission à un user
    [HttpPost("users/{userId}")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> AssignPermission(
        string userId,
        [FromBody] AssignPermissionRequest request)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
            return NotFound(new { message = "User not found" });

        var permission = await _db.Permissions.FindAsync(request.PermissionId);
        if (permission == null)
            return NotFound(new { message = "Permission not found" });

        if (!permission.IsActive)
            return BadRequest(new { message = "Cette permission est désactivée." });

        if (!ProjectPermissionCatalog.IsSupported(permission.Name))
            return BadRequest(new { message = ProjectPermissionCatalog.RejectionMessage });

        // Get the current user's ID (the one making the request)
        var grantedById = User.FindFirst(OpenIddict.Abstractions.OpenIddictConstants.Claims.Subject)?.Value ?? "";

        if (await _db.UserPermissions.AnyAsync(up =>
            up.UserId == userId && up.PermissionId == request.PermissionId))
            return BadRequest(new { message = "User already has this permission" });

        var userPermission = new UserPermission
        {
            UserId = userId,
            PermissionId = request.PermissionId,
            IsGranted = true,
            GrantedById = grantedById
        };

        await _db.UserPermissions.AddAsync(userPermission);
        await _db.SaveChangesAsync();

        return Ok(new { message = $"Permission '{permission.Name}' assigned successfully" });
    }

    // DELETE api/permissions/users/{userId}/{permissionId} — retirer permission
    [HttpDelete("users/{userId}/{permissionId}")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> RevokePermission(string userId, string permissionId)
    {
        var userPermission = await _db.UserPermissions
            .FirstOrDefaultAsync(up => up.UserId == userId && up.PermissionId == permissionId);

        if (userPermission == null)
            return NotFound(new { message = "Permission not found for this user" });

        _db.UserPermissions.Remove(userPermission);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Permission revoked successfully" });
    }
}

public record CreatePermissionRequest(
    string Name,
    string DisplayName,
    string Description,
    string Category,
    string? AppId
);

public record UpdatePermissionRequest(
    string Name,
    string DisplayName,
    string Description,
    string Category,
    string? AppId
);

public record SetPermissionActiveRequest(bool IsActive);

public record AssignPermissionRequest(
    string PermissionId
);

static class PermissionCategories
{
    public static string AppIdForCategory(string category) => category.Trim().ToLowerInvariant() switch
    {
        "capa" => "action-plan-app",
        "claims" => "claims-app",
        "quality" or "analyses qualité" => "quality-app",
        "alerts" or "alertes" => "alerts-app",
        "employees" or "employés" => "employees-app",
        "reports" or "rapports" => "reports-app",
        "admin" or "administration" => "admin-app",
        "rh" => "hr-app",
        "maintenance" => "maintenance-app",
        _ => category.Trim().ToLowerInvariant().Replace(' ', '-') + "-app"
    };
}