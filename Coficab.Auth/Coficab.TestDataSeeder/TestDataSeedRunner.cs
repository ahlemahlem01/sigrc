using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ActionPlanEntity = Coficab.ActionPlan.Core.Entities.ActionPlan;

namespace Coficab.TestDataSeeder;

internal sealed class TestDataSeedRunner
{
    private readonly AppDbContext _auth;
    private readonly ActionPlanDbContext _ap;
    private readonly UserManager<ApplicationUser> _users;
    private readonly RoleManager<IdentityRole> _roles;
    private readonly string _password;
    private readonly int _employeeCount;
    private readonly int _claimCount;
    private readonly int _planCount;
    private readonly Random _rng = new(20260907);

    public TestDataSeedRunner(
        AppDbContext auth,
        ActionPlanDbContext ap,
        UserManager<ApplicationUser> users,
        RoleManager<IdentityRole> roles,
        string password,
        int employeeCount,
        int claimCount,
        int planCount)
    {
        _auth = auth;
        _ap = ap;
        _users = users;
        _roles = roles;
        _password = password;
        _employeeCount = employeeCount;
        _claimCount = claimCount;
        _planCount = planCount;
    }

    public async Task<int> RunAsync(CancellationToken ct)
    {
        Console.WriteLine("=== Coficab Test Data Seeder ===");
        Console.WriteLine($"Marker: {TestDataMarkers.Tag}");
        Console.WriteLine($"Targets: {_employeeCount} employees, {_claimCount} claims, {_planCount} action plans");
        Console.WriteLine();

        var (org, depts) = await EnsureOrgAndDepartmentsAsync(ct);
        var employees = await EnsureEmployeesAsync(depts, ct);
        var claims = await EnsureClaimsAsync(employees, ct);
        await EnsureActionPlansAsync(employees, claims, org, depts, ct);

        Console.WriteLine();
        Console.WriteLine("--- Validation / auto-fix ---");
        var report = await TestDataValidator.ValidateAndFixAsync(_ap, employees.Select(e => e.UserId).ToList(), ct);
        Console.WriteLine($"Issues found: {report.IssuesFound}");
        Console.WriteLine($"Issues fixed: {report.IssuesFixed}");
        foreach (var msg in report.Messages.Take(40))
            Console.WriteLine("  " + msg);
        if (report.Messages.Count > 40)
            Console.WriteLine($"  ... {report.Messages.Count - 40} more");

        // Second pass: must be clean
        var report2 = await TestDataValidator.ValidateAndFixAsync(_ap, employees.Select(e => e.UserId).ToList(), ct);
        if (report2.IssuesFound > 0)
        {
            Console.WriteLine("ERROR: residual inconsistencies after auto-fix:");
            foreach (var msg in report2.Messages)
                Console.WriteLine("  " + msg);
            return 1;
        }

        await PrintSummaryAsync(ct);

        var empCount = await _ap.UserProfiles.CountAsync(p => p.Email.EndsWith("@" + TestDataMarkers.EmailDomain), ct);
        var claimCount = await _ap.Claims.IgnoreQueryFilters().CountAsync(c => c.Title.StartsWith(TestDataMarkers.Tag + " Claim "), ct);
        var planCount = await _ap.ActionPlans.IgnoreQueryFilters().CountAsync(p => p.Title.StartsWith(TestDataMarkers.Tag + " Plan ") && !p.Title.Contains(" / Action "), ct);
        if (empCount != _employeeCount || claimCount != _claimCount || planCount != _planCount)
        {
            Console.WriteLine($"ERROR: count mismatch employees={empCount}/{_employeeCount} claims={claimCount}/{_claimCount} plans={planCount}/{_planCount}");
            return 1;
        }

        Console.WriteLine();
        Console.WriteLine("Seed completed successfully (idempotent).");
        return 0;
    }

    private async Task<(Organization Org, Dictionary<string, Department> Depts)> EnsureOrgAndDepartmentsAsync(CancellationToken ct)
    {
        var org = await _ap.Organizations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Id == SeedIds.Org() || o.Name == TestDataMarkers.OrgName, ct);
        if (org is null)
        {
            org = new Organization
            {
                Id = SeedIds.Org(),
                Name = TestDataMarkers.OrgName,
                Type = OrganizationType.Local,
                CreatedAt = DateTime.UtcNow.AddMonths(-7),
                CreatedBy = TestDataMarkers.CreatedBy,
            };
            _ap.Organizations.Add(org);
            Console.WriteLine($"Created organization {org.Name}");
        }
        else
        {
            org.Name = TestDataMarkers.OrgName;
            org.CreatedBy = TestDataMarkers.CreatedBy;
            Console.WriteLine($"Organization already present ({org.Name})");
        }

        var map = new Dictionary<string, Department>(StringComparer.OrdinalIgnoreCase);
        foreach (var bp in SeedCatalog.Departments)
        {
            var id = SeedIds.Dept(bp.Code);
            var dept = await _ap.Departments.IgnoreQueryFilters()
                .FirstOrDefaultAsync(d => d.Id == id || d.Code == bp.Code, ct);
            if (dept is null)
            {
                dept = new Department
                {
                    Id = id,
                    Name = bp.Name,
                    Code = bp.Code,
                    Description = bp.Description + TestDataMarkers.DescriptionSuffix,
                    OrganizationId = org.Id,
                    CreatedAt = DateTime.UtcNow.AddMonths(-7),
                    CreatedBy = TestDataMarkers.CreatedBy,
                };
                _ap.Departments.Add(dept);
                Console.WriteLine($"  Created department {bp.Code}");
            }
            else
            {
                dept.Name = bp.Name;
                dept.Code = bp.Code;
                dept.Description = bp.Description + TestDataMarkers.DescriptionSuffix;
                dept.OrganizationId = org.Id;
                dept.CreatedBy = TestDataMarkers.CreatedBy;
            }
            map[bp.Code] = dept;
        }

        await _ap.SaveChangesAsync(ct);
        return (org, map);
    }

    private sealed record SeedEmployee(string UserId, string Email, string FullName, string DepartmentCode, Guid DepartmentId);

    private async Task<List<SeedEmployee>> EnsureEmployeesAsync(
        Dictionary<string, Department> depts,
        CancellationToken ct)
    {
        if (!await _roles.RoleExistsAsync("user"))
            await _roles.CreateAsync(new IdentityRole("user"));

        var result = new List<SeedEmployee>();
        var count = Math.Min(_employeeCount, SeedCatalog.Employees.Length);

        for (var i = 0; i < count; i++)
        {
            var bp = SeedCatalog.Employees[i];
            var email = TestDataMarkers.EmployeeEmail(i + 1);
            var user = await _users.FindByEmailAsync(email);
            if (user is null)
            {
                user = new ApplicationUser
                {
                    UserName = email,
                    Email = email,
                    EmailConfirmed = true,
                    FullName = bp.FullName,
                    Department = bp.DepartmentName,
                    DepartmentId = depts[bp.DepartmentCode].Id,
                    OrganizationId = SeedIds.Org(),
                };
                var create = await _users.CreateAsync(user, _password);
                if (!create.Succeeded)
                    throw new InvalidOperationException($"Failed to create {email}: {string.Join("; ", create.Errors.Select(e => e.Description))}");
                await _users.AddToRoleAsync(user, "user");
                Console.WriteLine($"  Created user {email}");
            }
            else
            {
                user.FullName = bp.FullName;
                user.Department = bp.DepartmentName;
                user.DepartmentId = depts[bp.DepartmentCode].Id;
                user.OrganizationId = SeedIds.Org();
                user.EmailConfirmed = true;
                await _users.UpdateAsync(user);
                if (!await _users.IsInRoleAsync(user, "user"))
                    await _users.AddToRoleAsync(user, "user");

                // Keep password stable for local test accounts
                var token = await _users.GeneratePasswordResetTokenAsync(user);
                await _users.ResetPasswordAsync(user, token, _password);
            }

            var profile = await _ap.UserProfiles
                .FirstOrDefaultAsync(p => p.UserId == user.Id || p.Email == email, ct);
            if (profile is null)
            {
                profile = new UserProfile
                {
                    Id = SeedIds.Profile(user.Id),
                    UserId = user.Id,
                    Name = bp.FullName,
                    Email = email,
                    Role = "user",
                    Phone = $"+21620{i + 1:000000}",
                    Poste = bp.Poste,
                    LigneProduction = bp.LigneProduction,
                    Equipe = bp.Equipe,
                    DepartmentId = depts[bp.DepartmentCode].Id,
                    HireDate = DateTime.UtcNow.AddMonths(-(8 + (i % 10))).Date,
                    Status = "active",
                    ActivityStatus = ActivityStatus.Active,
                    LastActivityAt = DateTime.UtcNow.AddDays(-(i % 12)),
                    LastLoginAt = DateTime.UtcNow.AddDays(-(i % 5)),
                    ActivityStatusComputedAt = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow.AddMonths(-7),
                };
                _ap.UserProfiles.Add(profile);
            }
            else
            {
                profile.UserId = user.Id;
                profile.Name = bp.FullName;
                profile.Email = email;
                profile.Role = "user";
                profile.Poste = bp.Poste;
                profile.LigneProduction = bp.LigneProduction;
                profile.Equipe = bp.Equipe;
                profile.DepartmentId = depts[bp.DepartmentCode].Id;
                profile.Status = "active";
                profile.UpdatedAt = DateTime.UtcNow;
            }

            result.Add(new SeedEmployee(user.Id, email, bp.FullName, bp.DepartmentCode, depts[bp.DepartmentCode].Id));
        }

        await _ap.SaveChangesAsync(ct);
        Console.WriteLine($"Employees ready: {result.Count}");
        return result;
    }

    private async Task<List<Claim>> EnsureClaimsAsync(List<SeedEmployee> employees, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var windowStart = now.AddMonths(-6);
        var list = new List<Claim>();

        for (var i = 1; i <= _claimCount; i++)
        {
            var id = SeedIds.Claim(i);
            var title = TestDataMarkers.ClaimTitle(i);
            var claim = await _ap.Claims.IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.Id == id || c.Title == title, ct);
            var isNew = claim is null;
            claim ??= new Claim { Id = id };

            var creator = employees[(i - 1) % employees.Count];
            var assignee = employees[i % employees.Count];
            var createdAt = windowStart.AddDays(_rng.Next(0, 180)).AddHours(_rng.Next(0, 23));
            if (createdAt > now) createdAt = now.AddDays(-1);

            var status = SeedCatalog.PickWeighted(_rng, SeedCatalog.ClaimStatusWeights);
            var severity = SeedCatalog.Severities[_rng.Next(SeedCatalog.Severities.Length)];
            var client = SeedCatalog.Clients[_rng.Next(SeedCatalog.Clients.Length)];
            var defect = SeedCatalog.DefectTypes[_rng.Next(SeedCatalog.DefectTypes.Length)];
            var line = SeedCatalog.Lines[_rng.Next(SeedCatalog.Lines.Length)];
            var team = SeedCatalog.Teams[_rng.Next(SeedCatalog.Teams.Length)];

            var needsAssignee = status is not ("DRAFT" or "OUVERTE");
            var closed = status is "CLOTUREE" or "CLOSED";

            DateTime? deadline = null;
            DateTime? completedAt = null;
            bool? isOnTime = null;
            DateTime? assignedAt = null;

            if (needsAssignee || closed)
            {
                assignedAt = createdAt.AddHours(_rng.Next(2, 48));
            }

            // ~85% of closed/validated claims get a deadline
            if (status is "CLOTUREE" or "VALIDATED" or "EN_ANALYSE" or "PENDING_VALIDATION" || _rng.NextDouble() < 0.35)
            {
                deadline = createdAt.Date.AddDays(_rng.Next(7, 45));
            }

            if (closed)
            {
                var spanDays = Math.Max(1, (int)(now - createdAt).TotalDays);
                completedAt = createdAt.AddDays(_rng.Next(1, Math.Min(40, Math.Max(2, spanDays))));
                if (completedAt > now) completedAt = now.AddHours(-2);
                if (deadline.HasValue)
                {
                    // Force a mix of on-time / late
                    if (i % 3 == 0)
                    {
                        deadline = completedAt.Value.Date.AddDays(-_rng.Next(1, 5));
                        isOnTime = false;
                    }
                    else
                    {
                        deadline = completedAt.Value.Date.AddDays(_rng.Next(0, 10));
                        isOnTime = completedAt.Value.Date <= deadline.Value.Date;
                    }
                }
                else
                {
                    isOnTime = null;
                }
            }

            claim.Title = title;
            claim.ClientId = client;
            claim.DefectType = defect;
            claim.Severity = severity;
            claim.LotNumber = $"LOT-TD-{i:0000}";
            claim.SerialNumber = $"SN-TD-{i:000000}";
            claim.Description = $"Reclamation de test #{i} — {defect} chez {client}.{TestDataMarkers.DescriptionSuffix}";
            claim.StatusCode = status;
            claim.DetectionDate = createdAt.AddHours(-_rng.Next(1, 36));
            claim.CreatedAt = createdAt;
            claim.CreatedBy = creator.FullName;
            claim.CreatedById = creator.UserId;
            claim.UpdatedAt = completedAt ?? assignedAt ?? createdAt.AddHours(3);
            claim.UpdatedById = assignee.UserId;
            claim.IsArchived = false;
            claim.ProductionLine = status is "DRAFT" or "OUVERTE" ? null : line;
            claim.Shift = status is "DRAFT" or "OUVERTE" ? null : team;
            claim.AnalysisNotes = status is "EN_ANALYSE" or "PENDING_VALIDATION" or "VALIDATED" or "CLOTUREE"
                ? "Notes d analyse generees (testdata)."
                : null;
            claim.ProducedQuantity = 1000 + _rng.Next(0, 9000);
            claim.DefectiveQuantity = _rng.Next(1, 40);
            claim.Deadline = deadline;
            claim.CompletedAt = completedAt;
            claim.IsOnTime = isOnTime;

            if (needsAssignee || closed)
            {
                claim.AssignedToId = assignee.UserId;
                claim.AssignedToName = assignee.FullName;
                claim.AssignedAt = assignedAt;
            }
            else
            {
                claim.AssignedToId = null;
                claim.AssignedToName = null;
                claim.AssignedAt = null;
            }

            // Enforce IsOnTime rule explicitly
            if (CompletionTrackingCompatible.IsClosed(claim.StatusCode))
            {
                claim.IsOnTime = claim.Deadline.HasValue && claim.CompletedAt.HasValue
                    ? claim.CompletedAt.Value.Date <= claim.Deadline.Value.Date
                    : null;
            }
            else
            {
                claim.CompletedAt = null;
                claim.IsOnTime = null;
            }

            if (isNew) _ap.Claims.Add(claim);
            list.Add(claim);

            // FiveWhy for non-draft (matches create flow expectations)
            if (status != "DRAFT")
            {
                var fwId = SeedIds.FiveWhy(i);
                var fw = await _ap.FiveWhyAnalyses.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(f => f.Id == fwId || f.ClaimId == claim.Id, ct);
                if (fw is null)
                {
                    fw = new FiveWhyAnalysis
                    {
                        Id = fwId,
                        ClaimId = claim.Id,
                        ProblemStatement = $"Probleme (testdata) : {defect}",
                        StatusCode = status is "VALIDATED" or "CLOTUREE" ? "VALIDATED" : status is "PENDING_VALIDATION" ? "PENDING_VALIDATION" : "DRAFT",
                        CreatedAt = createdAt.AddHours(4),
                        CreatedBy = TestDataMarkers.CreatedBy,
                    };
                    if (fw.StatusCode == "VALIDATED")
                    {
                        fw.IsValidated = true;
                        fw.ValidatedBy = assignee.FullName;
                        fw.ValidatedAt = createdAt.AddDays(3);
                        fw.RootCauseOccurrence = "Cause occurrence (testdata)";
                        fw.RootCauseDetection = "Cause detection (testdata)";
                    }
                    _ap.FiveWhyAnalyses.Add(fw);
                }
                else
                {
                    fw.ClaimId = claim.Id;
                    fw.ProblemStatement = $"Probleme (testdata) : {defect}";
                    fw.CreatedBy = TestDataMarkers.CreatedBy;
                }
            }
        }

        await _ap.SaveChangesAsync(ct);
        Console.WriteLine($"Claims ready: {list.Count}");
        return list;
    }

    private async Task EnsureActionPlansAsync(
        List<SeedEmployee> employees,
        List<Claim> claims,
        Organization org,
        Dictionary<string, Department> depts,
        CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var windowStart = now.AddMonths(-6);
        var closableClaims = claims
            .Where(c => c.StatusCode is "EN_ANALYSE" or "PENDING_VALIDATION" or "VALIDATED" or "CLOTUREE")
            .ToList();

        for (var i = 1; i <= _planCount; i++)
        {
            var id = SeedIds.Plan(i);
            var title = TestDataMarkers.PlanTitle(i);
            var plan = await _ap.ActionPlans
                .IgnoreQueryFilters()
                .Include(p => p.PlanActions)
                .FirstOrDefaultAsync(p => p.Id == id || p.Title == title, ct);
            var isNew = plan is null;
            plan ??= new ActionPlanEntity { Id = id };

            var owner = employees[(i - 1) % employees.Count];
            var assignee = employees[i % employees.Count];
            var dept = depts.Values.ElementAt((i - 1) % depts.Count);
            var createdAt = windowStart.AddDays(_rng.Next(0, 175)).AddHours(_rng.Next(0, 20));
            if (createdAt > now) createdAt = now.AddDays(-2);

            var statusRoll = _rng.Next(100);
            var status = statusRoll < 20 ? ActionPlanStatus.Created
                : statusRoll < 55 ? ActionPlanStatus.Ongoing
                : statusRoll < 90 ? ActionPlanStatus.Closed
                : ActionPlanStatus.Archived;

            var type = (ActionPlanType)(1 + (i % 3));
            DateTime? deadline = createdAt.Date.AddDays(_rng.Next(10, 50));
            DateTime? completedAt = null;
            bool? isOnTime = null;
            var progress = 0;

            if (status == ActionPlanStatus.Closed)
            {
                progress = 100;
                completedAt = createdAt.AddDays(_rng.Next(3, 35));
                if (completedAt > now) completedAt = now.AddHours(-3);
                if (i % 4 == 0)
                {
                    deadline = completedAt.Value.Date.AddDays(-_rng.Next(1, 6));
                    isOnTime = false;
                }
                else
                {
                    deadline = completedAt.Value.Date.AddDays(_rng.Next(0, 12));
                    isOnTime = completedAt.Value.Date <= deadline.Value.Date;
                }
            }
            else if (status == ActionPlanStatus.Ongoing)
            {
                progress = new[] { 25, 33, 50, 66, 75 }[_rng.Next(5)];
            }
            else if (status == ActionPlanStatus.Archived)
            {
                progress = 100;
                completedAt = createdAt.AddDays(20);
                isOnTime = deadline.HasValue ? completedAt.Value.Date <= deadline.Value.Date : null;
                // Archived is not Closed — clear completion fields to match CompletionTracking rules
                completedAt = null;
                isOnTime = null;
            }

            Guid? claimId = null;
            if (closableClaims.Count > 0 && i % 2 == 0)
                claimId = closableClaims[(i / 2) % closableClaims.Count].Id;

            plan.Title = title;
            plan.Description = $"Plan d action de test #{i}.{TestDataMarkers.DescriptionSuffix}";
            plan.Type = type;
            plan.Status = status;
            plan.OwnerId = owner.UserId;
            plan.OrganizationId = org.Id;
            plan.DepartmentId = dept.Id;
            plan.AssignedToId = status == ActionPlanStatus.Created && i % 5 == 0 ? null : assignee.UserId;
            plan.Deadline = deadline;
            plan.ClaimId = claimId;
            plan.CompletedAt = status == ActionPlanStatus.Closed ? completedAt : null;
            plan.IsOnTime = status == ActionPlanStatus.Closed
                ? (plan.Deadline.HasValue && plan.CompletedAt.HasValue
                    ? plan.CompletedAt.Value.Date <= plan.Deadline.Value.Date
                    : null)
                : null;
            plan.Progress = progress;
            plan.CreatedAt = createdAt;
            plan.CreatedBy = TestDataMarkers.CreatedBy;
            plan.UpdatedAt = plan.CompletedAt ?? createdAt.AddDays(2);
            plan.UpdatedBy = assignee.UserId;
            plan.IsArchived = false;
            plan.ArchivedAt = null;
            plan.ArchivedBy = null;
            // Keep Status=Archived visible for testdata (do not soft-delete via IsArchived).
            if (status == ActionPlanStatus.Archived)
            {
                plan.UpdatedBy = assignee.UserId;
            }

            if (isNew) _ap.ActionPlans.Add(plan);

            // Replace plan actions for idempotent shape (2..4)
            var existingActions = await _ap.PlanActions.IgnoreQueryFilters()
                .Where(a => a.ActionPlanId == plan.Id || a.Title.StartsWith(TestDataMarkers.PlanTitle(i) + " / Action "))
                .ToListAsync(ct);
            if (existingActions.Count > 0)
                _ap.PlanActions.RemoveRange(existingActions);

            var actionCount = 2 + (i % 3);
            for (var a = 1; a <= actionCount; a++)
            {
                var actionProgress = status == ActionPlanStatus.Closed
                    ? ActionProgress.Hundred
                    : status == ActionPlanStatus.Created
                        ? ActionProgress.NotStarted
                        : (ActionProgress)new[] { 25, 50, 75, 100 }[_rng.Next(4)];

                _ap.PlanActions.Add(new PlanAction
                {
                    Id = SeedIds.PlanAction(i, a),
                    Title = TestDataMarkers.PlanActionTitle(i, a),
                    Description = $"Action {a} du plan {i}.{TestDataMarkers.DescriptionSuffix}",
                    Progress = actionProgress,
                    Deadline = deadline?.AddDays(-a),
                    Priority = 1 + (a % 3),
                    AssignedToId = employees[(i + a) % employees.Count].UserId,
                    ActionPlanId = plan.Id,
                    Order = a,
                    Status = status == ActionPlanStatus.Closed
                        ? ActionPlanStatus.Closed
                        : status == ActionPlanStatus.Created
                            ? ActionPlanStatus.Created
                            : ActionPlanStatus.Ongoing,
                    CreatedAt = createdAt.AddHours(a),
                    CreatedBy = TestDataMarkers.CreatedBy,
                    UpdatedAt = createdAt.AddDays(a),
                    UpdatedBy = assignee.UserId,
                });
            }
        }

        await _ap.SaveChangesAsync(ct);
        Console.WriteLine($"Action plans ready: {_planCount}");
    }

    private async Task PrintSummaryAsync(CancellationToken ct)
    {
        var emp = await _ap.UserProfiles.CountAsync(p => p.Email.EndsWith("@" + TestDataMarkers.EmailDomain), ct);
        var claims = await _ap.Claims.IgnoreQueryFilters().CountAsync(c => c.Title.StartsWith(TestDataMarkers.Tag + " Claim "), ct);
        var plans = await _ap.ActionPlans.IgnoreQueryFilters().CountAsync(p => p.Title.StartsWith(TestDataMarkers.Tag + " Plan ") && !p.Title.Contains(" / Action "), ct);
        var actions = await _ap.PlanActions.IgnoreQueryFilters().CountAsync(a => a.Title.StartsWith(TestDataMarkers.Tag) && a.Title.Contains(" / Action "), ct);
        var closedClaims = await _ap.Claims.IgnoreQueryFilters().CountAsync(c => c.Title.StartsWith(TestDataMarkers.Tag + " Claim ") && c.StatusCode == "CLOTUREE", ct);
        var closedOnTime = await _ap.Claims.IgnoreQueryFilters().CountAsync(c => c.Title.StartsWith(TestDataMarkers.Tag + " Claim ") && c.StatusCode == "CLOTUREE" && c.IsOnTime == true, ct);
        var closedLate = await _ap.Claims.IgnoreQueryFilters().CountAsync(c => c.Title.StartsWith(TestDataMarkers.Tag + " Claim ") && c.StatusCode == "CLOTUREE" && c.IsOnTime == false, ct);
        var closedPlans = await _ap.ActionPlans.IgnoreQueryFilters().CountAsync(p => p.Title.StartsWith(TestDataMarkers.Tag + " Plan ") && p.Status == ActionPlanStatus.Closed, ct);

        Console.WriteLine();
        Console.WriteLine("--- Summary ---");
        Console.WriteLine($"Seed employees (profiles): {emp}");
        Console.WriteLine($"Seed claims: {claims} (closed={closedClaims}, onTime={closedOnTime}, late={closedLate})");
        Console.WriteLine($"Seed action plans: {plans} (closed={closedPlans})");
        Console.WriteLine($"Seed plan actions: {actions}");
    }
}

/// <summary>Local mirror of closed-status detection to avoid circular timing issues during construction.</summary>
internal static class CompletionTrackingCompatible
{
    public static bool IsClosed(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        var s = status.Trim().ToUpperInvariant();
        return s is "CLOTUREE" or "CLOSED" or "CLOTURE" or "CLOTURÉE";
    }
}
