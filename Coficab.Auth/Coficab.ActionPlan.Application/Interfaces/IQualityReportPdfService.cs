using Coficab.ActionPlan.Application.Services;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface IQualityReportPdfService
{
    Task<byte[]> GenerateQualityReportPdfAsync(Guid claimId, CancellationToken cancellationToken = default);

    /// <summary>The customer report as the data of the claim give it today.</summary>
    Task<QualityReportModel> BuildReportModelAsync(Guid claimId, CancellationToken cancellationToken = default);

    /// <summary>Draws the PDF of a report model (built or edited).</summary>
    byte[] RenderPdf(QualityReportModel model);
}
