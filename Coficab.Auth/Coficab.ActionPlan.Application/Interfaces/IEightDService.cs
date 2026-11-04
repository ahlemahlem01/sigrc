using Coficab.ActionPlan.Application.Services;
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

    /// <summary>The customer report: the latest edited version, or the one the data of the claim give today when it was never edited.</summary>
    Task<EightDReportDto> GetReportAsync(Guid claimId, CancellationToken ct = default);
    /// <summary>The report rebuilt from the data of the claim (to start an edit again from the current data). Nothing is saved.</summary>
    Task<QualityReportModel> GetFreshReportAsync(Guid claimId, CancellationToken ct = default);
    /// <summary>Saves an edited report as a new version and makes its PDF the customer PDF. Earlier versions stay readable.</summary>
    Task<EightDReportDto> SaveReportAsync(Guid claimId, QualityReportModel model, string? note, string userId, CancellationToken ct = default);
    Task<IReadOnlyList<EightDReportVersionDto>> GetReportVersionsAsync(Guid claimId, CancellationToken ct = default);
    Task<EightDReportDto?> GetReportVersionAsync(Guid claimId, int version, CancellationToken ct = default);
}
