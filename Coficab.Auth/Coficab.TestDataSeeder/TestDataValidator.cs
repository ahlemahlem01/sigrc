using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using ActionPlanEntity = Coficab.ActionPlan.Core.Entities.ActionPlan;

namespace Coficab.TestDataSeeder;

internal static class TestDataValidator
{
    public sealed record Report(int IssuesFound, int IssuesFixed, IReadOnlyList<string> Messages);

    public static async Task<Report> ValidateAndFixAsync(
        ActionPlanDbContext ap,
        IReadOnlyList<string> seedUserIds,
        CancellationToken ct)
    {
        var messages = new List<string>();
        var found = 0;
        var fixedCount = 0;
        var seedSet = seedUserIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;
        var windowStart = now.AddMonths(-6).AddDays(-1);

        var claims = await ap.Claims
            .IgnoreQueryFilters()
            .Where(c => c.Title.StartsWith(TestDataMarkers.Tag + " Claim "))
            .ToListAsync(ct);

        var plans = await ap.ActionPlans
            .IgnoreQueryFilters()
            .Include(p => p.PlanActions)
            .Where(p => p.Title.StartsWith(TestDataMarkers.Tag + " Plan ")
                        && !p.Title.Contains(" / Action "))
            .ToListAsync(ct);

        var planIds = plans.Select(p => p.Id).ToHashSet();
        var claimIds = claims.Select(c => c.Id).ToHashSet();

        // Orphan plan actions belonging to testdata titles but missing parent
        var orphanActions = await ap.PlanActions
            .IgnoreQueryFilters()
            .Where(a => a.Title.StartsWith(TestDataMarkers.Tag)
                        && a.Title.Contains(" / Action ")
                        && !planIds.Contains(a.ActionPlanId))
            .ToListAsync(ct);
        foreach (var orphan in orphanActions)
        {
            found++;
            messages.Add($"FIX orphan PlanAction {orphan.Id} ({orphan.Title})");
            ap.PlanActions.Remove(orphan);
            fixedCount++;
        }

        foreach (var claim in claims)
        {
            var closed = CompletionTracking.IsClosedClaimStatus(claim.StatusCode);

            if (closed)
            {
                if (!claim.CompletedAt.HasValue)
                {
                    found++;
                    claim.CompletedAt = (claim.UpdatedAt ?? claim.CreatedAt).ToUniversalTime();
                    if (claim.CompletedAt < claim.CreatedAt) claim.CompletedAt = claim.CreatedAt.AddHours(4);
                    messages.Add($"FIX claim {claim.Title}: missing CompletedAt");
                    fixedCount++;
                }

                if (claim.CompletedAt < claim.CreatedAt)
                {
                    found++;
                    claim.CompletedAt = claim.CreatedAt.AddHours(6);
                    messages.Add($"FIX claim {claim.Title}: CompletedAt before CreatedAt");
                    fixedCount++;
                }

                var expectedOnTime = claim.Deadline.HasValue
                    ? claim.CompletedAt!.Value.Date <= claim.Deadline.Value.Date
                    : (bool?)null;
                if (claim.IsOnTime != expectedOnTime)
                {
                    found++;
                    claim.IsOnTime = expectedOnTime;
                    messages.Add($"FIX claim {claim.Title}: IsOnTime -> {expectedOnTime}");
                    fixedCount++;
                }

                if (string.IsNullOrWhiteSpace(claim.AssignedToId))
                {
                    found++;
                    var uid = seedUserIds[Math.Abs(claim.Title.GetHashCode()) % seedUserIds.Count];
                    claim.AssignedToId = uid;
                    claim.AssignedToName ??= "Seed Employee";
                    claim.AssignedAt ??= claim.CreatedAt.AddHours(1);
                    messages.Add($"FIX claim {claim.Title}: closed without assignee");
                    fixedCount++;
                }
            }
            else
            {
                if (claim.CompletedAt.HasValue || claim.IsOnTime.HasValue)
                {
                    found++;
                    claim.CompletedAt = null;
                    claim.IsOnTime = null;
                    messages.Add($"FIX claim {claim.Title}: cleared completion on open status");
                    fixedCount++;
                }
            }

            var needsAssignee = claim.StatusCode is "ASSIGNED" or "EN_ANALYSE"
                or "PENDING_VALIDATION" or "VALIDATED" or "CLOTUREE" or "CLOSED";
            if (needsAssignee)
            {
                if (string.IsNullOrWhiteSpace(claim.AssignedToId)
                    || (!seedSet.Contains(claim.AssignedToId)
                        && !claim.AssignedToId.Equals(claim.CreatedById, StringComparison.OrdinalIgnoreCase)))
                {
                    // Prefer keeping valid unknown production users; only force if empty or invalid seed reference pattern
                    if (string.IsNullOrWhiteSpace(claim.AssignedToId))
                    {
                        found++;
                        var uid = seedUserIds[Math.Abs(claim.Title.GetHashCode()) % seedUserIds.Count];
                        claim.AssignedToId = uid;
                        claim.AssignedAt ??= claim.CreatedAt.AddHours(2);
                        messages.Add($"FIX claim {claim.Title}: missing AssignedToId");
                        fixedCount++;
                    }
                }

                if (!string.IsNullOrWhiteSpace(claim.AssignedToId) && string.IsNullOrWhiteSpace(claim.AssignedToName))
                {
                    found++;
                    claim.AssignedToName = "Seed Employee";
                    messages.Add($"FIX claim {claim.Title}: missing AssignedToName");
                    fixedCount++;
                }

                if (!string.IsNullOrWhiteSpace(claim.AssignedToId) && !claim.AssignedAt.HasValue)
                {
                    found++;
                    claim.AssignedAt = claim.CreatedAt.AddHours(1);
                    messages.Add($"FIX claim {claim.Title}: missing AssignedAt");
                    fixedCount++;
                }
            }

            if (claim.CreatedAt < windowStart || claim.CreatedAt > now.AddDays(1))
            {
                found++;
                claim.CreatedAt = now.AddDays(-(Math.Abs(claim.Title.GetHashCode()) % 170));
                messages.Add($"FIX claim {claim.Title}: CreatedAt outside 6-month window");
                fixedCount++;
            }

            if (claim.DetectionDate > claim.CreatedAt)
            {
                found++;
                claim.DetectionDate = claim.CreatedAt.AddHours(-6);
                messages.Add($"FIX claim {claim.Title}: DetectionDate after CreatedAt");
                fixedCount++;
            }

            if (!string.IsNullOrWhiteSpace(claim.AssignedToId)
                && claim.AssignedToId.StartsWith("seed-missing", StringComparison.OrdinalIgnoreCase))
            {
                found++;
                claim.AssignedToId = seedUserIds[0];
                messages.Add($"FIX claim {claim.Title}: invalid AssignedToId");
                fixedCount++;
            }
        }

        foreach (var plan in plans)
        {
            var closed = plan.Status == ActionPlanStatus.Closed;

            if (closed)
            {
                if (!plan.CompletedAt.HasValue)
                {
                    found++;
                    plan.CompletedAt = (plan.UpdatedAt ?? plan.CreatedAt).ToUniversalTime();
                    if (plan.CompletedAt < plan.CreatedAt) plan.CompletedAt = plan.CreatedAt.AddDays(1);
                    messages.Add($"FIX plan {plan.Title}: missing CompletedAt");
                    fixedCount++;
                }

                if (plan.CompletedAt < plan.CreatedAt)
                {
                    found++;
                    plan.CompletedAt = plan.CreatedAt.AddDays(2);
                    messages.Add($"FIX plan {plan.Title}: CompletedAt before CreatedAt");
                    fixedCount++;
                }

                var expectedOnTime = plan.Deadline.HasValue
                    ? plan.CompletedAt!.Value.Date <= plan.Deadline.Value.Date
                    : (bool?)null;
                if (plan.IsOnTime != expectedOnTime)
                {
                    found++;
                    plan.IsOnTime = expectedOnTime;
                    messages.Add($"FIX plan {plan.Title}: IsOnTime -> {expectedOnTime}");
                    fixedCount++;
                }

                if (plan.Progress < 100) plan.Progress = 100;
            }
            else
            {
                if (plan.CompletedAt.HasValue || plan.IsOnTime.HasValue)
                {
                    found++;
                    plan.CompletedAt = null;
                    plan.IsOnTime = null;
                    messages.Add($"FIX plan {plan.Title}: cleared completion on non-closed status");
                    fixedCount++;
                }
            }

            if (string.IsNullOrWhiteSpace(plan.OwnerId) || !seedSet.Contains(plan.OwnerId))
            {
                // Owner must be a seed employee for testdata plans
                found++;
                plan.OwnerId = seedUserIds[Math.Abs(plan.Title.GetHashCode()) % seedUserIds.Count];
                messages.Add($"FIX plan {plan.Title}: OwnerId reset to seed employee");
                fixedCount++;
            }

            if (!string.IsNullOrWhiteSpace(plan.AssignedToId) && !seedSet.Contains(plan.AssignedToId))
            {
                found++;
                plan.AssignedToId = seedUserIds[(Math.Abs(plan.Title.GetHashCode()) + 3) % seedUserIds.Count];
                messages.Add($"FIX plan {plan.Title}: AssignedToId not in seed set");
                fixedCount++;
            }

            if (plan.ClaimId.HasValue && !claimIds.Contains(plan.ClaimId.Value))
            {
                // Keep link only if claim exists among testdata; otherwise clear dangling ClaimId
                var anyClaim = await ap.Claims.AnyAsync(c => c.Id == plan.ClaimId.Value, ct);
                if (!anyClaim)
                {
                    found++;
                    plan.ClaimId = null;
                    messages.Add($"FIX plan {plan.Title}: cleared orphan ClaimId");
                    fixedCount++;
                }
            }

            if (plan.CreatedAt < windowStart || plan.CreatedAt > now.AddDays(1))
            {
                found++;
                plan.CreatedAt = now.AddDays(-(Math.Abs(plan.Title.GetHashCode()) % 170));
                messages.Add($"FIX plan {plan.Title}: CreatedAt outside 6-month window");
                fixedCount++;
            }

            if (plan.PlanActions.Count == 0)
            {
                found++;
                var action = new PlanAction
                {
                    Id = SeedIds.PlanAction(ParsePlanIndex(plan.Title), 1),
                    Title = TestDataMarkers.PlanActionTitle(ParsePlanIndex(plan.Title), 1),
                    Description = "Auto-repaired missing action." + TestDataMarkers.DescriptionSuffix,
                    Progress = closed ? ActionProgress.Hundred : ActionProgress.Fifty,
                    Priority = 2,
                    AssignedToId = plan.AssignedToId ?? plan.OwnerId,
                    ActionPlanId = plan.Id,
                    Order = 1,
                    Status = closed ? ActionPlanStatus.Closed : ActionPlanStatus.Ongoing,
                    CreatedAt = plan.CreatedAt.AddHours(1),
                    CreatedBy = TestDataMarkers.CreatedBy,
                    Deadline = plan.Deadline,
                };
                ap.PlanActions.Add(action);
                messages.Add($"FIX plan {plan.Title}: added missing PlanAction");
                fixedCount++;
            }

            foreach (var action in plan.PlanActions)
            {
                if (action.ActionPlanId != plan.Id)
                {
                    found++;
                    action.ActionPlanId = plan.Id;
                    messages.Add($"FIX action {action.Title}: ActionPlanId mismatch");
                    fixedCount++;
                }

                if (!string.IsNullOrWhiteSpace(action.AssignedToId) && !seedSet.Contains(action.AssignedToId))
                {
                    found++;
                    action.AssignedToId = plan.AssignedToId ?? plan.OwnerId;
                    messages.Add($"FIX action {action.Title}: AssignedToId reset");
                    fixedCount++;
                }
            }
        }

        // Profiles without Poste/Equipe for seed users
        var profiles = await ap.UserProfiles
            .Where(p => p.Email.EndsWith("@" + TestDataMarkers.EmailDomain))
            .ToListAsync(ct);
        foreach (var profile in profiles)
        {
            if (string.IsNullOrWhiteSpace(profile.Poste))
            {
                found++;
                profile.Poste = "Collaborateur";
                messages.Add($"FIX profile {profile.Email}: empty Poste");
                fixedCount++;
            }
            if (string.IsNullOrWhiteSpace(profile.Equipe))
            {
                found++;
                profile.Equipe = "Equipe A";
                messages.Add($"FIX profile {profile.Email}: empty Equipe");
                fixedCount++;
            }
            if (!profile.DepartmentId.HasValue)
            {
                found++;
                var dept = await ap.Departments.FirstAsync(d => d.Code == "SEED-QUAL", ct);
                profile.DepartmentId = dept.Id;
                messages.Add($"FIX profile {profile.Email}: missing DepartmentId");
                fixedCount++;
            }
        }

        if (fixedCount > 0)
            await ap.SaveChangesAsync(ct);

        return new Report(found, fixedCount, messages);
    }

    private static int ParsePlanIndex(string title)
    {
        // "[TESTDATA] Plan 012"
        var parts = title.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3 && int.TryParse(parts[2], out var n) && n >= 1) return n;
        return 1;
    }
}
