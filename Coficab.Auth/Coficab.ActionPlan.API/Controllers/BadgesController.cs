using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using System.Security.Claims;

namespace Coficab.ActionPlan.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class BadgesController : ControllerBase
{
    private readonly ActionPlanDbContext _context;

    public BadgesController(ActionPlanDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Récupère les badges de l'utilisateur connecté (pour UserDashboard)
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMyBadges()
    {
        var userId = User.FindFirst(OpenIddictConstants.Claims.Subject)?.Value;
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié" });

        var badges = await _context.Badges
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.EarnedAt)
            .ToListAsync();

        return Ok(new { data = badges });
    }

    /// <summary>
    /// Récupère les badges d'un employé spécifique (pour EmployeeAdminView)
    /// </summary>
    [HttpGet("user/{userId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetUserBadges(string userId)
    {
        if (string.IsNullOrEmpty(userId))
            return BadRequest(new { message = "UserId requis" });

        var badges = await _context.Badges
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.EarnedAt)
            .ToListAsync();

        return Ok(new { data = badges });
    }

    /// <summary>
    /// Attribue un badge à un employé (admin only)
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> AssignBadge([FromBody] AssignBadgeRequest request)
    {
        if (string.IsNullOrEmpty(request.UserId) || string.IsNullOrEmpty(request.Name))
            return BadRequest(new { message = "UserId et Name requis" });

        var badge = new Badge
        {
            Id = string.IsNullOrEmpty(request.Id) ? Guid.NewGuid() : Guid.Parse(request.Id),
            UserId = request.UserId,
            Name = request.Name,
            Description = request.Description ?? string.Empty,
            Icon = request.Icon ?? "🏅",
            Color = request.Color ?? "#3b82f6",
            Category = request.Category ?? "General",
            PlanTitle = request.PlanTitle,
            EarnedAt = DateTime.UtcNow
        };

        _context.Badges.Add(badge);
        await _context.SaveChangesAsync();

        return Ok(badge);
    }
}

public class AssignBadgeRequest
{
    public string? Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Icon { get; set; }
    public string? Color { get; set; }
    public string? Category { get; set; }
    public string? PlanTitle { get; set; }
}