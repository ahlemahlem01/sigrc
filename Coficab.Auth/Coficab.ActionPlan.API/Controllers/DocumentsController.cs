using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Coficab.ActionPlan.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private readonly ActionPlanDbContext _context;
    private readonly IWebHostEnvironment _environment;

    public DocumentsController(ActionPlanDbContext context, IWebHostEnvironment environment)
    {
        _context = context;
        _environment = environment;
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMyDocuments()
    {
        var userId = User.FindFirst("sub")?.Value
                  ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var rows = await _context.Documents
            .AsNoTracking()
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new
            {
                d.Id,
                d.Name,
                d.Type,
                d.Category,
                d.Description,
                d.CreatedBy,
                d.CreatedAt,
                LastViewedAt = d.LastViewedByUserId == userId ? d.LastViewedAt : null,
                IsFavorite = d.Favorites.Any(f => f.UserId == userId),
            })
            .ToListAsync();

        // Dates as ISO 8601 so the page formats them in the user's language; "Never" when not opened yet.
        var documents = rows.Select(d => new DocumentDto
        {
            Id = d.Id.ToString(),
            Name = d.Name,
            Type = d.Type,
            Category = d.Category,
            Description = d.Description,
            CreatedBy = d.CreatedBy,
            CreatedAt = d.CreatedAt.ToString("o"),
            LastViewed = d.LastViewedAt?.ToString("o") ?? "Never",
            IsFavorite = d.IsFavorite,
        });

        return Ok(new { data = documents });
    }

    [HttpGet("{id}/download")]
    public async Task<IActionResult> DownloadDocument(string id, [FromServices] IAuthorizationService authorization)
    {
        if (!Guid.TryParse(id, out var docId))
            return BadRequest();

        var document = await _context.Documents.FindAsync(docId);
        if (document == null)
            return NotFound();

        // Owner or admin only. Not found (not 403) so ids of other people's documents are not confirmed.
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var isOwner = !string.IsNullOrEmpty(userId) && string.Equals(document.UserId, userId, StringComparison.OrdinalIgnoreCase);
        if (!isOwner && !(await authorization.AuthorizeAsync(User, "AdminOnly")).Succeeded)
            return NotFound();

        var storedPath = document.FilePath ?? string.Empty;
        if (storedPath.StartsWith("blob:", StringComparison.OrdinalIgnoreCase) ||
            storedPath.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            storedPath.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new
            {
                error = "Ce document n'a pas été enregistré sur le serveur. Veuillez le téléverser à nouveau depuis la fiche employé.",
                filePath = storedPath
            });
        }

        var fullPath = DocumentStorage.Resolve(_environment, storedPath);
        if (fullPath == null || !System.IO.File.Exists(fullPath))
            return NotFound(new { error = "Fichier introuvable sur le serveur." });

        var bytes = await System.IO.File.ReadAllBytesAsync(fullPath);

        // "Last opened" on the employee's list: record only the owner's own downloads.
        if (isOwner)
        {
            document.LastViewedByUserId = userId;
            document.LastViewedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        var contentType = GetMimeType(document.Type);
        return File(bytes, contentType, document.Name);
    }

    [HttpPost("{id}/favorite")]
    public async Task<IActionResult> ToggleFavorite(string id)
    {
        var userId = User.FindFirst("sub")?.Value
                  ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        if (!Guid.TryParse(id, out var documentGuid))
            return BadRequest();

        // Use a transaction to avoid concurrency issues
        await using var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            var document = await _context.Documents
                .Include(d => d.Favorites)
                .FirstOrDefaultAsync(d => d.Id == documentGuid);

            if (document == null || !string.Equals(document.UserId, userId, StringComparison.OrdinalIgnoreCase))
                return NotFound();

            var existing = document.Favorites.FirstOrDefault(f => f.UserId == userId);
            bool isFavorite;

            if (existing != null)
            {
                _context.Set<DocumentFavorite>().Remove(existing);
                isFavorite = false;
            }
            else
            {
                // Check again to avoid duplicates
                var hasFavorite = await _context.Set<DocumentFavorite>()
                    .AnyAsync(f => f.DocumentId == documentGuid && f.UserId == userId);

                if (!hasFavorite)
                {
                    _context.Set<DocumentFavorite>().Add(new DocumentFavorite
                    {
                        Id = Guid.NewGuid(),
                        DocumentId = document.Id,
                        UserId = userId,
                        AddedAt = DateTime.UtcNow
                    });
                }
                isFavorite = true;
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new { isFavorite });
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static string GetMimeType(string type) => type.ToUpper() switch
    {
        "PDF" => "application/pdf",
        "DOC" or "DOCX" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "XLS" or "XLSX" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "IMG" or "JPG" or "JPEG" => "image/jpeg",
        "PNG" => "image/png",
        _ => "application/octet-stream"
    };
}