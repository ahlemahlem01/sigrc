using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.ReferenceLists;
using Coficab.ActionPlan.Core.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Application.MlFeatures.Queries;

/// <summary>Une ligne d'entraînement IsOnTime (features alignées sur ml-service).</summary>
public record TrainingDatasetRowDto(
    string ClaimId,
    string DefectType,
    string Severity,
    string? DepartmentId,
    double? EmployeeSkill,
    double? Workload,
    bool IsOnTime,
    DateTime? CompletedAt,
    // History features known at assignment time (see EmployeeHistory); the model trains on these.
    double? OnTimeRate = null,
    int? ClosedCount = null,
    int? OpenClaims = null,
    double? AllocDays = null
);

public record TrainingDatasetDto(
    int Count,
    IReadOnlyList<TrainingDatasetRowDto> Items
);

public record GetTrainingDatasetQuery : IRequest<TrainingDatasetDto>;

public class GetTrainingDatasetQueryHandler
    : IRequestHandler<GetTrainingDatasetQuery, TrainingDatasetDto>
{
    private static readonly string[] ClosedStatuses =
    {
        "CLOTUREE", "CLOSED", "REJECTED"
    };

    private readonly IApplicationDbContext _db;

    public GetTrainingDatasetQueryHandler(IApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<TrainingDatasetDto> Handle(
        GetTrainingDatasetQuery request,
        CancellationToken cancellationToken)
    {
        var defectTypes = await DefectTypeResolver.LoadAsync(_db, cancellationToken);
        var labeled = await _db.Claims
            .AsNoTracking()
            .Where(c => !c.IsArchived && c.IsOnTime != null)
            .Select(c => new
            {
                c.Id,
                c.DefectType,
                c.Severity,
                c.AssignedToId,
                c.IsOnTime,
                c.CompletedAt,
                c.CreatedAt,
                c.AssignedAt,
                c.Deadline,
            })
            .ToListAsync(cancellationToken);

        if (labeled.Count == 0)
            return new TrainingDatasetDto(0, Array.Empty<TrainingDatasetRowDto>());

        var assigneeIds = labeled
            .Select(c => c.AssignedToId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var profiles = await _db.UserProfiles
            .AsNoTracking()
            .Include(p => p.Department)
            .Where(p => assigneeIds.Contains(p.UserId))
            .ToListAsync(cancellationToken);

        var profileByUser = profiles
            .GroupBy(p => p.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        // Charge actuelle : claims ouvertes assignées / 8 (bornée à [0,1])
        var openLoads = await _db.Claims
            .AsNoTracking()
            .Where(c =>
                !c.IsArchived
                && c.AssignedToId != null
                && !ClosedStatuses.Contains(c.StatusCode.ToUpper()))
            .GroupBy(c => c.AssignedToId!)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var loadByUser = openLoads.ToDictionary(
            x => x.UserId,
            x => Math.Clamp(x.Count / 8.0, 0.0, 1.0),
            StringComparer.OrdinalIgnoreCase);

        var now = DateTime.UtcNow;
        var rows = new List<TrainingDatasetRowDto>(labeled.Count);

        // History features: every assigned claim counts for the workload, closed ones for the punctuality rate.
        var assigned = await _db.Claims
            .AsNoTracking()
            .Where(c => !c.IsArchived && c.AssignedToId != null)
            .Select(c => new { c.Id, c.AssignedToId, c.AssignedAt, c.CreatedAt, c.Deadline, c.CompletedAt, c.IsOnTime })
            .ToListAsync(cancellationToken);
        var outcomes = assigned.Select(c => new ClaimOutcome(
            c.Id, c.AssignedToId!, c.AssignedAt ?? c.CreatedAt, c.Deadline, c.CompletedAt, c.IsOnTime)).ToList();
        var priorTimeline = new EmployeeHistory.TeamPriorTimeline(outcomes);
        var outcomesByUser = outcomes.GroupBy(o => o.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<ClaimOutcome>)g.ToList(), StringComparer.OrdinalIgnoreCase);

        foreach (var c in labeled)
        {
            string? dept = null;
            double? skill = null;
            double? workload = null;

            if (!string.IsNullOrWhiteSpace(c.AssignedToId)
                && profileByUser.TryGetValue(c.AssignedToId, out var profile))
            {
                dept = !string.IsNullOrWhiteSpace(profile.Department?.Code)
                    ? profile.Department!.Code.Trim().ToUpperInvariant()
                    : profile.Department?.Name?.Trim().ToUpperInvariant();

                skill = DeriveSkill(profile, now);
                workload = loadByUser.TryGetValue(c.AssignedToId, out var w) ? w : 0.15;
            }

            var severity = string.IsNullOrWhiteSpace(c.Severity)
                ? "MEDIUM"
                : c.Severity.Trim().ToUpperInvariant();

            double? onTimeRate = null, allocDays = null;
            int? closedCount = null, openClaims = null;
            if (!string.IsNullOrWhiteSpace(c.AssignedToId) && outcomesByUser.TryGetValue(c.AssignedToId, out var mine))
            {
                var assignedAt = c.AssignedAt ?? c.CreatedAt;
                var current = new ClaimOutcome(c.Id, c.AssignedToId, assignedAt, c.Deadline, c.CompletedAt, c.IsOnTime);
                // Too early in the history for a team average to mean anything: the row is not used for training.
                if (priorTimeline.At(assignedAt) is not { } teamRate) continue;
                var h = EmployeeHistory.AsOfAssignment(mine, current, teamRate);
                onTimeRate = Math.Round(h.OnTimeRate, 4);
                closedCount = h.ClosedCount;
                openClaims = h.OpenClaims;
                allocDays = EmployeeHistory.AllocatedDays(assignedAt, c.Deadline);
            }

            rows.Add(new TrainingDatasetRowDto(
                c.Id.ToString(),
                defectTypes.Resolve(c.DefectType),
                severity,
                dept,
                skill,
                workload,
                c.IsOnTime!.Value,
                c.CompletedAt,
                onTimeRate,
                closedCount,
                openClaims,
                allocDays
            ));
        }

        return new TrainingDatasetDto(rows.Count, rows);
    }

    private static double DeriveSkill(Core.Entities.UserProfile profile, DateTime now)
    {
        var hire = profile.HireDate == default ? now.AddYears(-2) : profile.HireDate;
        var years = Math.Max(0.0, (now - hire).TotalDays / 365.25);
        var baseSkill = years switch
        {
            < 1 => 2.0,
            < 3 => 3.0,
            < 7 => 4.0,
            _ => 5.0,
        };

        baseSkill = profile.ActivityStatus switch
        {
            ActivityStatus.Active => Math.Min(5.0, baseSkill + 0.5),
            ActivityStatus.LowActivity => baseSkill,
            ActivityStatus.Inactive => Math.Max(1.0, baseSkill - 1.0),
            _ => baseSkill,
        };

        return Math.Round(Math.Clamp(baseSkill, 1.0, 5.0), 2);
    }
}
