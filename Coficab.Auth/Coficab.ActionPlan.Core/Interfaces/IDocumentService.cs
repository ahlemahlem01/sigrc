namespace Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;

public interface IDocumentService
{
    Task<IEnumerable<DocumentDto>> GetUserDocumentsAsync(string userId);
    Task<IEnumerable<DocumentDto>> GetAllDocumentsAsync(); // ← nouveau
    Task<IEnumerable<DocumentDto>> GetRecentDocumentsAsync(string userId, int count = 5);
    Task<bool> ToggleFavoriteAsync(string userId, Guid documentId);
    Task<DocumentDto?> GetByIdAsync(Guid id);
    Task<DocumentDto> UploadAsync(UploadDocumentDto dto);
    /// <summary>Deletes the row and returns its stored file path (null when not found), so the caller can remove the file.</summary>
    Task<string?> DeleteAsync(Guid id);
}