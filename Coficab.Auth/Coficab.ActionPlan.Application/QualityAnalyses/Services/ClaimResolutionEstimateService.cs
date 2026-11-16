using Coficab.ActionPlan.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Services;

public sealed class ClaimResolutionEstimateService : IClaimResolutionEstimateService
{
    public const int MinSampleSize = ClaimResolutionEstimateLogic.MinSampleSize;

    private readonly IApplicationDbContext _db;
    private readonly IDelayModelClient? _model;

    public ClaimResolutionEstimateService(IApplicationDbContext db, IDelayModelClient? model = null)
    {
        _db = db;
        _model = model;
    }

    public async Task<ClaimResolutionEstimateDto?> EstimateAsync(
        string? defectType,
        string? severity,
        CancellationToken cancellationToken = default,
        ClaimEstimateContext? context = null)
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

        // the machine-learning model only answers when it passed its validation gate; otherwise null and the percentiles below are shown
        var ml = context is null || _model is null
            ? null
            : await _model.TryEstimateAsync(defectType, severity, context, cancellationToken);

        var rows = closed
            .Select(c => new ClaimResolutionEstimateLogic.SampleRow(
                ClaimResolutionEstimateLogic.Normalize(c.DefectType) ?? string.Empty,
                (ClaimResolutionEstimateLogic.Normalize(c.Severity) ?? string.Empty).ToUpperInvariant(),
                Math.Max(0, (c.CompletedAt - c.CreatedAt).TotalDays)))
            .ToList();

        return ClaimEstimateSelection.Choose(ClaimResolutionEstimateLogic.EstimateFromSamples(rows, defectType, severity), ml, defectType, severity);
    }
}
