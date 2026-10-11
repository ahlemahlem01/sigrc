using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using OpenIddict.Validation.AspNetCore;

namespace Coficab.Auth.API.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)]
public class PreferencesController : ControllerBase
{
    private readonly AppDbContext _db;

    public PreferencesController(AppDbContext db) => _db = db;

    private string? UserId =>
        User.FindFirst(OpenIddictConstants.Claims.Subject)?.Value
        ?? User.FindFirst("sub")?.Value;

    [HttpGet("~/api/me/preferences")]
    public async Task<IActionResult> Get()
    {
        var userId = UserId;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var row = await _db.UserPreferences.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == userId);
        return Ok(ToDto(row));
    }

    [HttpPut("~/api/me/preferences")]
    public async Task<IActionResult> Save([FromBody] PreferenceRequest request)
    {
        var userId = UserId;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var theme = Normalize(request.Theme, "light", "dark") ?? "light";
        var exportFormat = Normalize(request.ExportFormat, "excel", "pdf", "csv") ?? "csv";
        var importFormat = Normalize(request.ImportFormat, "excel", "csv") ?? "csv";

        var row = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == userId);
        if (row == null)
        {
            row = new UserPreference { UserId = userId };
            _db.UserPreferences.Add(row);
        }

        row.Theme = theme;
        row.ExportFormat = exportFormat;
        row.ImportFormat = importFormat;
        await _db.SaveChangesAsync();
        return Ok(ToDto(row));
    }

    private static object ToDto(UserPreference? row) => new
    {
        theme = row?.Theme ?? "light",
        exportFormat = row?.ExportFormat ?? "csv",
        importFormat = row?.ImportFormat ?? "csv",
    };

    private static string? Normalize(string? value, params string[] allowed)
    {
        var v = (value ?? string.Empty).Trim().ToLowerInvariant();
        return allowed.Contains(v) ? v : null;
    }

    public sealed class PreferenceRequest
    {
        public string? Theme { get; set; }
        public string? ExportFormat { get; set; }
        public string? ImportFormat { get; set; }
    }
}
