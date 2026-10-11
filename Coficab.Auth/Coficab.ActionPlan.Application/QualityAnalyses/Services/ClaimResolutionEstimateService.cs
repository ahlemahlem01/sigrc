using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

public sealed class ClaimResolutionEstimateService : IClaimResolutionEstimateService
{
    public const int MinSampleSize = ClaimResolutionEstimateLogic.MinSampleSize;

    private readonly IApplicationDbContext _db;

    public ClaimResolutionEstimateService(IApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<ClaimResolutionEstimateDto?> EstimateAsync(
        string? defectType,
        string? severity,
        CancellationToken cancellationToken = default)
    {
        var closed = await _db.Claims
            .AsNoTracking()
            .Where(c => c.CompletedAt != null)
            .Select(c => new
            {
                c.DefectType,
                c.Severity,
                c.CreatedAt,
                CompletedAt = c.CompletedAt!.Value
            })
            .ToListAsync(cancellationToken);

        if (closed.Count == 0)
            return null;

        var rows = closed
            .Select(c => new ClaimResolutionEstimateLogic.SampleRow(
                ClaimResolutionEstimateLogic.Normalize(c.DefectType) ?? string.Empty,
                (ClaimResolutionEstimateLogic.Normalize(c.Severity) ?? string.Empty).ToUpperInvariant(),
                Math.Max(0, (c.CompletedAt - c.CreatedAt).TotalDays)))
            .ToList();

        return ClaimResolutionEstimateLogic.EstimateFromSamples(rows, defectType, severity);
    }
}
