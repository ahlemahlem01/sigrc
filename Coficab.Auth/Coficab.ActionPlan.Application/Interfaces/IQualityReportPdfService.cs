namespace Coficab.ActionPlan.Application.Interfaces;

public interface IQualityReportPdfService
{
    Task<byte[]> GenerateQualityReportPdfAsync(Guid claimId, CancellationToken cancellationToken = default);
}