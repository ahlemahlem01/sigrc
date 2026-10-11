using System.Security.Claims;
using Coficab.ActionPlan.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/quality-assistant")]
[Authorize]
public class QualityAssistantController : ControllerBase
{
    private readonly IQualityAssistantService _assistant;

    public QualityAssistantController(IQualityAssistantService assistant)
    {
        _assistant = assistant;
    }

    public sealed class ChatRequest
    {
        public string Message { get; set; } = string.Empty;
        /// <summary>UI language code: fr | en | it</summary>
        public string? Language { get; set; }
        public List<HistoryItem>? History { get; set; }
    }

    public sealed class HistoryItem
    {
        public string Role { get; set; } = "user";
        public string Content { get; set; } = string.Empty;
    }

    /// <summary>
    /// Chat Assistant Qualité (Gemini + function calling).
    /// Le scope est dérivé du rôle JWT : employé = données personnelles, admin = organisation.
    /// </summary>
    [HttpPost("chat")]
    public async Task<IActionResult> Chat(
        [FromBody] ChatRequest request,
        CancellationToken cancellationToken)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Utilisateur non authentifié." });

        if (request == null || string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { message = "Le message est requis." });

        if (request.Message.Length > 4000)
            return BadRequest(new { message = "Message trop long (max 4000 caractères)." });

        var isAdmin = IsAdminOrSuperAdmin();
        var history = request.History?
            .Where(h => !string.IsNullOrWhiteSpace(h.Content))
            .Take(20)
            .Select(h => new QualityAssistantMessageDto(
                string.IsNullOrWhiteSpace(h.Role) ? "user" : h.Role.Trim(),
                h.Content.Trim()))
            .ToList();

        try
        {
            var result = await _assistant.ChatAsync(
                userId,
                isAdmin,
                request.Message.Trim(),
                history,
                request.Language,
                cancellationToken);

            return Ok(new
            {
                reply = result.Reply,
                scope = isAdmin ? "admin" : "employee",
                generatedAt = DateTime.UtcNow,
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(502, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private string? CurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub");

    private bool IsAdminOrSuperAdmin()
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
}
