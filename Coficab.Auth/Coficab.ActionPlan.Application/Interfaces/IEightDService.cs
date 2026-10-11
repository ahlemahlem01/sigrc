using Coficab.ActionPlan.Core.DTOs.Claims;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface IEightDService
{
    Task<EightDDossierDto> GetOrCreateAsync(Guid claimId, string userId, CancellationToken ct = default);
    /// <summary>Read-only view of a claim's 8D: never creates or updates the dossier (dashboards).</summary>
    Task<EightDDossierDto?> PeekAsync(Guid claimId, CancellationToken ct = default);
    Task<EightDDossierDto> SaveAsync(Guid claimId, SaveEightDDossierDto dto, string userId, CancellationToken ct = default);
    Task<EightDDossierDto> SubmitAsync(Guid claimId, string userId, CancellationToken ct = default);
    Task<EightDDossierDto> ValidateAsync(Guid claimId, ValidateEightDDossierDto dto, string userId, CancellationToken ct = default);
    Task<IReadOnlyList<EightDDossierDto>> GetPendingAsync(CancellationToken ct = default);
    Task<byte[]> GetOrGenerateCustomerPdfAsync(Guid claimId, string userId, CancellationToken ct = default);
    Task<byte[]> RegenerateCustomerPdfAsync(Guid claimId, string userId, CancellationToken ct = default);
    /// <summary>Version history of the dossier, newest first. A dossier that predates versioning gets its current state recorded as the first version.</summary>
    Task<IReadOnlyList<EightDVersionSummaryDto>> GetVersionsAsync(Guid claimId, CancellationToken ct = default);
    Task<EightDVersionDetailDto?> GetVersionAsync(Guid claimId, int version, CancellationToken ct = default);
}
