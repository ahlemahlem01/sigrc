using AutoMapper;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.Services;

public class DocumentService : IDocumentService
{
    private readonly IApplicationDbContext _context;
    private readonly IMapper _mapper;
    private readonly ITimelineService _timelineService;

    public DocumentService(IApplicationDbContext context, IMapper mapper, ITimelineService timelineService)
    {
        _context = context;
        _mapper = mapper;
        _timelineService = timelineService;
    }

    public async Task<IEnumerable<DocumentDto>> GetUserDocumentsAsync(string userId)
    {
        var favorites = await _context.DocumentFavorites
            .Where(f => f.UserId == userId)
            .Select(f => f.DocumentId)
            .ToListAsync();

        var docs = await _context.Documents
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.LastViewedAt)
            .Take(20)
            .ToListAsync();

        return docs.Select(d => new DocumentDto
        {
            Id = d.Id.ToString(),
            Name = d.Name,
            Type = d.Type,
            LastViewed = d.LastViewedAt?.ToString("yyyy-MM-dd") ?? d.CreatedAt.ToString("yyyy-MM-dd"),
            IsFavorite = favorites.Contains(d.Id),
            UserId = d.UserId,
            Category = d.Category,
            CreatedBy = d.CreatedBy,
            FilePath = d.FilePath,
            Description = d.Description,
            CreatedAt = d.CreatedAt.ToString("o"),
        });
    }

    // ← nouveau : une seule requête SQL pour tous les employés
    public async Task<IEnumerable<DocumentDto>> GetAllDocumentsAsync()
    {
        var favoriteIds = await _context.DocumentFavorites
            .Select(f => new { f.UserId, f.DocumentId })
            .ToListAsync();

        var docs = await _context.Documents
            .OrderByDescending(d => d.LastViewedAt)
            .ToListAsync();

        return docs.Select(d => new DocumentDto
        {
            Id = d.Id.ToString(),
            Name = d.Name,
            Type = d.Type,
            LastViewed = d.LastViewedAt?.ToString("yyyy-MM-dd") ?? d.CreatedAt.ToString("yyyy-MM-dd"),
            IsFavorite = favoriteIds.Any(f => f.DocumentId == d.Id && f.UserId == d.UserId),
            UserId = d.UserId,
            Category = d.Category,
            CreatedBy = d.CreatedBy,
            FilePath = d.FilePath,
            Description = d.Description,
            CreatedAt = d.CreatedAt.ToString("o"),
        });
    }

    public async Task<IEnumerable<DocumentDto>> GetRecentDocumentsAsync(string userId, int count = 5)
    {
        return (await GetUserDocumentsAsync(userId)).Take(count);
    }

    public async Task<bool> ToggleFavoriteAsync(string userId, Guid documentId)
    {
        var existing = await _context.DocumentFavorites
            .FirstOrDefaultAsync(f => f.UserId == userId && f.DocumentId == documentId);

        if (existing != null)
        {
            _context.DocumentFavorites.Remove(existing);
        }
        else
        {
            _context.DocumentFavorites.Add(new DocumentFavorite
            {
                DocumentId = documentId,
                UserId = userId
            });
        }

        await _context.SaveChangesAsync();
        return existing == null;
    }

    public async Task<DocumentDto?> GetByIdAsync(Guid id)
    {
        var doc = await _context.Documents.FindAsync(id);
        return doc == null ? null : _mapper.Map<DocumentDto>(doc);
    }

    public async Task<DocumentDto> CreateAsync(CreateDocumentDto dto)
    {
        var doc = new Document
        {
            Id = Guid.NewGuid(),
            UserId = dto.UserId,
            Name = dto.Name,
            Type = dto.Type,
            Description = dto.Description,
            FilePath = dto.FilePath,
            ThumbnailUrl = dto.ThumbnailUrl,
            Category = dto.Category,
            CreatedBy = dto.CreatedBy,
            CreatedAt = DateTime.UtcNow
        };
        _context.Documents.Add(doc);
        await _context.SaveChangesAsync();

        await _timelineService.CreateAsync(new CreateTimelineEventDto
        {
            UserId = doc.UserId,
            Type = "note",
            Title = $"Document ajouté : {doc.Name}",
            Description = doc.Description
        });

        return _mapper.Map<DocumentDto>(doc);
    }

    public async Task<DocumentDto> UploadAsync(UploadDocumentDto dto)
    {
        var doc = new Document
        {
            Id = Guid.NewGuid(),
            UserId = dto.UserId,
            Name = dto.Name,
            Type = dto.Type,
            Description = dto.Description,
            FilePath = dto.FilePath,
            ThumbnailUrl = dto.ThumbnailUrl,
            Category = dto.Category,
            CreatedBy = dto.CreatedBy,
            CreatedAt = DateTime.UtcNow
        };
        _context.Documents.Add(doc);
        await _context.SaveChangesAsync();

        await _timelineService.CreateAsync(new CreateTimelineEventDto
        {
            UserId = doc.UserId,
            Type = "note",
            Title = $"Document ajouté : {doc.Name}",
            Description = doc.Description
        });

        return _mapper.Map<DocumentDto>(doc);
    }

    public async Task<string?> DeleteAsync(Guid id)
    {
        var doc = await _context.Documents.FindAsync(id);
        if (doc == null)
            return null;

        _context.Documents.Remove(doc);
        await _context.SaveChangesAsync();
        return doc.FilePath;
    }
}