// Controllers/NotificationsController.cs
using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Coficab.ActionPlan.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly INotificationService _notificationService;

    public NotificationsController(INotificationService notificationService)
    {
        _notificationService = notificationService;
    }

    private string? UserId => User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    [HttpGet("me")]
    public async Task<IActionResult> GetMyNotifications()
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        var notifications = await _notificationService.GetForUserAsync(UserId);
        return Ok(new { data = notifications });
    }

    [HttpGet("me/unread-count")]
    public async Task<IActionResult> GetUnreadCount()
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        var count = await _notificationService.GetUnreadCountAsync(UserId);
        return Ok(new { count });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id)
    {
        if (string.IsNullOrEmpty(UserId)) return Unauthorized();
        await _notificationService.MarkAsReadAsync(id, UserId);
        return Ok();
    }
}