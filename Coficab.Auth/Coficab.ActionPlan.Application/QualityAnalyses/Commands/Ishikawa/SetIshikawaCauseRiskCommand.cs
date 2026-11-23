using Coficab.ActionPlan.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Ishikawa;

/// <summary>
/// The analyst scores an Ishikawa cause for the prospective Pareto: Severity, Occurrence and Detection, 1 to 10 each (all three, or all null to clear).
/// The scores are an estimate by the analyst, not a statistic, and they are traced in the claim history.
/// </summary>
public record SetIshikawaCauseRiskCommand(Guid CauseId, int? Severity, int? Occurrence, int? Detection, string ActorId) : IRequest<IshikawaRiskResult>;

public record IshikawaRiskResult(string? Code, Guid? ClaimId = null, int? Criticality = null);

public static class IshikawaRiskRules
{
    public const int Min = 1, Max = 10;

    /// <summary>Null when the three scores are acceptable: all absent, or all present and between 1 and 10.</summary>
    public static string? Check(int? severity, int? occurrence, int? detection)
    {
        var given = new[] { severity, occurrence, detection }.Count(v => v.HasValue);
        if (given == 0) return null;
        if (given != 3) return "allOrNone";
        foreach (var v in new[] { severity!.Value, occurrence!.Value, detection!.Value })
            if (v < Min || v > Max) return "outOfRange";
        return null;
    }

    /// <summary>Criticality = Severity × Occurrence × Detection (1 to 1000); null when the cause is not fully scored.</summary>
    public static int? Criticality(int? severity, int? occurrence, int? detection) =>
        severity.HasValue && occurrence.HasValue && detection.HasValue ? severity.Value * occurrence.Value * detection.Value : null;
}

public class SetIshikawaCauseRiskCommandHandler : IRequestHandler<SetIshikawaCauseRiskCommand, IshikawaRiskResult>
{
    private readonly IApplicationDbContext _context;

    public SetIshikawaCauseRiskCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<IshikawaRiskResult> Handle(SetIshikawaCauseRiskCommand request, CancellationToken ct)
    {
        var cause = await _context.IshikawaCauses.FirstOrDefaultAsync(c => c.Id == request.CauseId && !c.IsArchived, ct);
        if (cause is null) return new("notFound");

        var code = IshikawaRiskRules.Check(request.Severity, request.Occurrence, request.Detection);
        if (code is not null) return new(code);

        var before = IshikawaRiskRules.Criticality(cause.RiskSeverity, cause.RiskOccurrence, cause.RiskDetection);
        cause.RiskSeverity = request.Severity;
        cause.RiskOccurrence = request.Occurrence;
        cause.RiskDetection = request.Detection;
        var after = IshikawaRiskRules.Criticality(request.Severity, request.Occurrence, request.Detection);

        var text = cause.CauseDescription.Length > 80 ? cause.CauseDescription[..80] + "…" : cause.CauseDescription;
        var detail = after.HasValue
            ? $"{text} · G{request.Severity} × O{request.Occurrence} × D{request.Detection} = {after}" + (before.HasValue ? $" (avant : {before})" : string.Empty)
            : $"{text} · notes retirées";
        await _context.SaveChangesAsync(ct);
        await ClaimAudit.RecordAsync(_context, cause.ClaimId, "ishikawa_risk_scored", request.ActorId, detail, ct);
        return new(null, cause.ClaimId, after);
    }
}
