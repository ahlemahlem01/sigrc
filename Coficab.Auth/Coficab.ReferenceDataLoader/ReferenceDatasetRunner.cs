using System.Security.Cryptography;
using System.Text;
using Coficab.ActionPlan.Core.Common;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Core.Enums;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.Auth.API.Data;
using Coficab.Auth.API.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ActionPlanEntity = Coficab.ActionPlan.Core.Entities.ActionPlan;

namespace Coficab.ReferenceDataLoader;

/// <summary>
/// Remplit un historique qualité réaliste (réclamations + CAPA légers)
/// sans préfixe visible de type [REFDATA]. Idempotent via IDs stables.
/// </summary>
internal sealed class ReferenceDatasetRunner
{
    private readonly AppDbContext _auth;
    private readonly ActionPlanDbContext _ap;
    private readonly UserManager<ApplicationUser> _users;
    private readonly int _claimCount;
    private readonly int _planCount;
    private readonly bool _purgeReferenceData;
    private readonly Random _rng = new(20260923);

    private static readonly string[] Zones =
        ["A12", "B07", "C03", "ancrage", "pin 4", "pin 12", "branche gauche", "branche droite", "feuillard"];
    private static readonly string[] Sides = ["gauche", "droit", "central"];

    public ReferenceDatasetRunner(
        AppDbContext auth,
        ActionPlanDbContext ap,
        UserManager<ApplicationUser> users,
        int claimCount,
        int planCount,
        bool purgeReferenceData)
    {
        _auth = auth;
        _ap = ap;
        _users = users;
        _claimCount = claimCount;
        _planCount = planCount;
        _purgeReferenceData = purgeReferenceData;
    }

    public async Task<int> RunAsync(CancellationToken ct)
    {
        Console.WriteLine("=== Coficab — jeu de données qualité (historique site) ===");
        Console.WriteLine($"Cible: {_claimCount} réclamations, {_planCount} plans CAPA");
        Console.WriteLine();

        if (_purgeReferenceData)
            await PurgeMarkedReferenceDataAsync(ct);

        var actors = await ResolveActorsAsync(ct);
        if (actors.Count == 0)
        {
            Console.WriteLine("ERROR: aucun utilisateur utilisable (Ahlem / qualité / seed).");
            return 1;
        }

        Console.WriteLine($"Acteurs: {actors.Count} ({string.Join(", ", actors.Take(5).Select(a => a.Name))}…)");

        var claims = await EnsureClaimsAsync(actors, ct);
        await EnsureActionPlansAsync(actors, claims, ct);
        // Bring every claim to the pieces its stage implies (D3, Ishikawa, priority cause, 5 Why): additive only.
        await new D4UpgradeRunner(_ap, apply: true).RunAsync(ct);
        await PrintSummaryAsync(ct);

        Console.WriteLine();
        Console.WriteLine("Terminé. Les titres/descriptions n'ont pas de marqueur de génération.");
        return 0;
    }

    private async Task PurgeMarkedReferenceDataAsync(CancellationToken ct)
    {
        Console.WriteLine("Nettoyage des anciennes entrées [REFDATA]…");
        var testClaims = await _ap.Claims.IgnoreQueryFilters()
            .Where(c => c.Title.StartsWith("[REFDATA]") || c.LotNumber.StartsWith("LOT-TD-"))
            .ToListAsync(ct);
        var testClaimIds = testClaims.Select(c => c.Id).ToList();

        if (testClaimIds.Count > 0)
        {
            var fws = await _ap.FiveWhyAnalyses.IgnoreQueryFilters()
                .Where(f => testClaimIds.Contains(f.ClaimId))
                .ToListAsync(ct);
            _ap.FiveWhyAnalyses.RemoveRange(fws);
            _ap.Claims.RemoveRange(testClaims);
        }

        var testPlans = await _ap.ActionPlans.IgnoreQueryFilters()
            .Where(p => p.Title.StartsWith("[REFDATA]"))
            .ToListAsync(ct);
        if (testPlans.Count > 0)
        {
            var planIds = testPlans.Select(p => p.Id).ToList();
            var actions = await _ap.PlanActions.IgnoreQueryFilters()
                .Where(a => planIds.Contains(a.ActionPlanId))
                .ToListAsync(ct);
            _ap.PlanActions.RemoveRange(actions);
            _ap.ActionPlans.RemoveRange(testPlans);
        }

        await _ap.SaveChangesAsync(ct);
        Console.WriteLine($"  Supprimé: {testClaims.Count} claims, {testPlans.Count} plans [REFDATA]");
    }

    private sealed record Actor(string UserId, string Name, string? Line);

    private async Task<List<Actor>> ResolveActorsAsync(CancellationToken ct)
    {
        var preferredEmails = new[]
        {
            "ahlem.alaya@coficab.com",
            "ahlem.alaya@esprit.tn",
            "admin@coficab.com",
        };

        var list = new List<Actor>();
        foreach (var email in preferredEmails)
        {
            var u = await _users.FindByEmailAsync(email);
            if (u == null) continue;
            var profile = await _ap.UserProfiles.AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == u.Id, ct);
            list.Add(new Actor(
                u.Id,
                string.IsNullOrWhiteSpace(u.FullName) ? email : u.FullName!,
                profile?.LigneProduction));
        }

        // Compléter avec profils qualité / production actifs
        var extras = await _ap.UserProfiles.AsNoTracking()
            .Where(p => p.Status == "active" && p.UserId != null)
            .OrderBy(p => p.Name)
            .Take(40)
            .ToListAsync(ct);

        foreach (var p in extras)
        {
            if (list.Any(a => a.UserId == p.UserId)) continue;
            list.Add(new Actor(p.UserId!, p.Name ?? p.Email ?? p.UserId!, p.LigneProduction));
            if (list.Count >= 25) break;
        }

        return list;
    }

    private async Task<List<Claim>> EnsureClaimsAsync(List<Actor> actors, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var windowStart = now.AddMonths(-14);
        var list = new List<Claim>();
        var scenarios = RealisticClaimCatalog.Scenarios;

        // Semaines de pic (anomalie WR-04 soudure) : S-2 et S-1
        var spikeWeek1 = StartOfWeek(now.AddDays(-10));
        var spikeWeek2 = StartOfWeek(now.AddDays(-3));

        for (var i = 1; i <= _claimCount; i++)
        {
            var id = DemoIds.Claim(i);
            var claim = await _ap.Claims.IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.Id == id, ct);
            var isNew = claim is null;
            claim ??= new Claim { Id = id };

            var forceSpike = i <= 55; // ~55 claims concentrés sur les pics WR-04
            ScenarioPick pick;
            DateTime createdAt;

            if (forceSpike)
            {
                var week = i % 2 == 0 ? spikeWeek1 : spikeWeek2;
                createdAt = week.AddHours(_rng.Next(6, 20)).AddMinutes(_rng.Next(0, 59));
                pick = new ScenarioPick(
                    RealisticClaimCatalog.Scenarios.First(s =>
                        s.Defect == "Soudure défectueuse" && s.Line == "WR-04"),
                    "WR-04");
            }
            else
            {
                createdAt = windowStart
                    .AddDays(_rng.Next(0, Math.Max(1, (int)(now - windowStart).TotalDays - 1)))
                    .AddHours(_rng.Next(5, 22));
                pick = PickScenario();
            }

            if (createdAt > now) createdAt = now.AddHours(-_rng.Next(2, 48));

            var creator = actors[(i - 1) % actors.Count];
            var assignee = actors[i % actors.Count];
            var status = RealisticClaimCatalog.PickWeighted(_rng, RealisticClaimCatalog.StatusWeights);
            var severity = RealisticClaimCatalog.Severities[
                Math.Min(RealisticClaimCatalog.Severities.Length - 1,
                    _rng.NextDouble() < 0.12 ? 3 : _rng.NextDouble() < 0.35 ? 2 : _rng.Next(2))];
            var client = RealisticClaimCatalog.Clients[_rng.Next(RealisticClaimCatalog.Clients.Length)];
            var shift = RealisticClaimCatalog.Shifts[_rng.Next(RealisticClaimCatalog.Shifts.Length)];
            var lot = $"LOT-{createdAt:yyyy}-{(createdAt.DayOfYear):000}-{_rng.Next(10, 99):00}";
            var serial = $"SN-{createdAt:yy}{_rng.Next(100000, 999999)}";

            var vars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["zone"] = Zones[_rng.Next(Zones.Length)],
                ["side"] = Sides[_rng.Next(Sides.Length)],
                ["line"] = pick.Line,
                ["client"] = client,
                ["lot"] = lot,
                ["shift"] = shift,
                ["tol"] = _rng.Next(2, 9).ToString(),
                ["qty"] = _rng.Next(2, 28).ToString(),
                ["prod"] = (800 + _rng.Next(0, 4200)).ToString(),
            };

            var title = RealisticClaimCatalog.Render(pick.Scenario.TitleTemplate, vars);
            var description = RealisticClaimCatalog.Render(pick.Scenario.DescriptionTemplate, vars);

            // Variantes de titre pour éviter les doublons trop visibles
            if (!forceSpike && _rng.NextDouble() < 0.35)
                title = $"{pick.Scenario.Defect} — {pick.Line} / {vars["zone"]}";

            var needsAssignee = status is not "OUVERTE";
            var closed = status is "CLOTUREE";

            DateTime? deadline = null;
            DateTime? completedAt = null;
            DateTime? assignedAt = needsAssignee ? createdAt.AddHours(_rng.Next(1, 36)) : null;

            if (status is "CLOTUREE" or "VALIDATED" or "EN_ANALYSE" or "PENDING_VALIDATION" || _rng.NextDouble() < 0.4)
                deadline = createdAt.Date.AddDays(_rng.Next(5, 28));

            if (closed)
            {
                var maxDays = Math.Clamp((int)(now - createdAt).TotalDays, 2, 35);
                completedAt = createdAt.AddDays(_rng.Next(1, maxDays)).AddHours(_rng.Next(1, 10));
                if (completedAt > now) completedAt = now.AddHours(-3);
                if (deadline.HasValue)
                {
                    if (i % 4 == 0)
                        deadline = completedAt.Value.Date.AddDays(-_rng.Next(1, 4));
                    else
                        deadline = completedAt.Value.Date.AddDays(_rng.Next(0, 8));
                }
            }

            var produced = 500 + _rng.Next(0, 9500);
            var defective = Math.Max(1, (int)(produced * (_rng.NextDouble() * 0.012 + 0.0004)));

            claim.Title = Truncate(title, 180);
            claim.ClientId = client;
            claim.DefectType = pick.Scenario.Defect;
            claim.Severity = severity;
            claim.LotNumber = lot;
            claim.SerialNumber = serial;
            claim.Description = description;
            claim.StatusCode = status;
            claim.DetectionDate = createdAt.AddHours(-_rng.Next(0, 20));
            claim.CreatedAt = createdAt;
            claim.CreatedBy = creator.Name;
            claim.CreatedById = creator.UserId;
            claim.UpdatedAt = completedAt ?? assignedAt ?? createdAt.AddHours(2);
            claim.UpdatedById = assignee.UserId;
            claim.IsArchived = false;
            claim.ProductionLine = pick.Line;
            claim.Shift = shift;
            claim.AnalysisNotes = status is "EN_ANALYSE" or "PENDING_VALIDATION" or "VALIDATED" or "CLOTUREE"
                ? BuildAnalysisNote(pick.Scenario.Defect, pick.Line)
                : null;
            claim.ProducedQuantity = produced;
            claim.DefectiveQuantity = defective;
            claim.Deadline = deadline;
            claim.CompletedAt = closed ? completedAt : null;
            claim.IsOnTime = closed && deadline.HasValue && completedAt.HasValue
                ? completedAt.Value.Date <= deadline.Value.Date
                : null;
            claim.EstimatedDaysP50 = 6 + _rng.NextDouble() * 6;
            claim.EstimatedDaysP80 = 10 + _rng.NextDouble() * 8;
            claim.EstimateMethod = "type_severity";
            claim.EstimateSampleSize = 20 + _rng.Next(0, 80);
            claim.EstimatedAt = createdAt;

            if (needsAssignee)
            {
                claim.AssignedToId = assignee.UserId;
                claim.AssignedToName = assignee.Name;
                claim.AssignedAt = assignedAt;
            }
            else
            {
                claim.AssignedToId = null;
                claim.AssignedToName = null;
                claim.AssignedAt = null;
            }

            // ~2% des claims démo rattachés à Ahlem (périmètre employé réaliste).
            var ahlem = actors.FirstOrDefault(a =>
                a.Name.Contains("Ahlem", StringComparison.OrdinalIgnoreCase)
                || a.Name.Contains("Alaya", StringComparison.OrdinalIgnoreCase));
            if (ahlem != null && (i <= 12 || (!forceSpike && i % 47 == 0)))
            {
                claim.CreatedById = ahlem.UserId;
                claim.CreatedBy = ahlem.Name;
                if (needsAssignee && i % 2 == 0)
                {
                    claim.AssignedToId = ahlem.UserId;
                    claim.AssignedToName = ahlem.Name;
                }
            }

            if (isNew) _ap.Claims.Add(claim);
            list.Add(claim);

            if (status != "OUVERTE")
            {
                var fwId = DemoIds.FiveWhy(i);
                var fw = await _ap.FiveWhyAnalyses.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(f => f.Id == fwId || f.ClaimId == claim.Id, ct);
                if (fw is null)
                {
                    fw = new FiveWhyAnalysis
                    {
                        Id = fwId,
                        ClaimId = claim.Id,
                        ProblemStatement = description.Length > 240 ? description[..240] : description,
                        StatusCode = status is "VALIDATED" or "CLOTUREE" ? "VALIDATED"
                            : status is "PENDING_VALIDATION" ? "PENDING_VALIDATION" : "DRAFT",
                        CreatedAt = createdAt.AddHours(3),
                        CreatedBy = creator.Name,
                    };
                    if (fw.StatusCode == "VALIDATED")
                    {
                        fw.IsValidated = true;
                        fw.ValidatedBy = assignee.Name;
                        fw.ValidatedAt = createdAt.AddDays(2);
                        fw.RootCauseOccurrence = RootCauseOccurrence(pick.Scenario.Defect);
                        fw.RootCauseDetection = "Contrôle en ligne / test électrique insuffisamment sensible sur ce mode de défaut.";
                    }
                    _ap.FiveWhyAnalyses.Add(fw);
                }
            }

            if (i % 100 == 0)
                await _ap.SaveChangesAsync(ct);
        }

        await _ap.SaveChangesAsync(ct);
        Console.WriteLine($"Réclamations prêtes: {list.Count}");
        return list;
    }

    private async Task EnsureActionPlansAsync(List<Actor> actors, List<Claim> claims, CancellationToken ct)
    {
        var orgId = await _ap.Organizations.AsNoTracking()
            .Select(o => o.Id)
            .FirstOrDefaultAsync(ct);
        var deptId = await _ap.Departments.AsNoTracking()
            .Where(d => !d.IsArchived)
            .Select(d => d.Id)
            .FirstOrDefaultAsync(ct);

        if (orgId == Guid.Empty || deptId == Guid.Empty)
        {
            var org = new Organization
            {
                Id = ReferenceIds.Org(),
                Name = "Coficab",
                Type = OrganizationType.Local,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "seed"
            };
            var dept = new Department
            {
                Id = ReferenceIds.Dept("QA"),
                Name = "Qualité",
                Code = "QA",
                OrganizationId = org.Id,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "seed"
            };
            _ap.Organizations.Add(org);
            _ap.Departments.Add(dept);
            await _ap.SaveChangesAsync(ct);
            orgId = org.Id;
            deptId = dept.Id;
        }

        var candidates = claims
            .Where(c => c.StatusCode is "EN_ANALYSE" or "PENDING_VALIDATION" or "VALIDATED" or "CLOTUREE")
            .OrderByDescending(c => c.CreatedAt)
            .Take(Math.Max(_planCount * 2, 50))
            .ToList();

        var now = DateTime.UtcNow;
        for (var i = 1; i <= _planCount && i <= candidates.Count; i++)
        {
            var claim = candidates[i - 1];
            var id = DemoIds.Plan(i);
            var plan = await _ap.ActionPlans.IgnoreQueryFilters()
                .FirstOrDefaultAsync(p => p.Id == id, ct);
            var isNew = plan is null;
            plan ??= new ActionPlanEntity { Id = id };

            var owner = actors[(i - 1) % actors.Count];
            var assignee = actors[i % actors.Count];
            var createdAt = claim.CreatedAt.AddDays(_rng.Next(0, 5)).AddHours(2);
            if (createdAt > now) createdAt = now.AddDays(-1);

            // CAPA must follow claim lifecycle: closed claim ⇒ closed plan (no "En cours" orphans).
            var closed = CompletionTracking.IsClosedClaimStatus(claim.StatusCode);
            plan.Title = $"CAPA — {claim.DefectType} ({claim.ProductionLine})";
            plan.Description =
                $"Actions correctives suite à la réclamation « {claim.Title} ». " +
                $"Client {claim.ClientId}, lot {claim.LotNumber}.";
            plan.Status = closed ? ActionPlanStatus.Closed
                : _rng.NextDouble() < 0.35 ? ActionPlanStatus.Created : ActionPlanStatus.Ongoing;
            plan.Type = ActionPlanType.PAC;
            plan.ClaimId = claim.Id;
            plan.OrganizationId = orgId;
            plan.DepartmentId = deptId;
            plan.CreatedAt = createdAt;
            plan.CreatedBy = owner.Name;
            plan.OwnerId = owner.UserId;
            plan.AssignedToId = assignee.UserId;
            plan.Deadline = createdAt.Date.AddDays(_rng.Next(10, 40));
            plan.UpdatedAt = createdAt.AddDays(1);
            plan.UpdatedBy = assignee.Name;
            plan.IsArchived = false;
            if (closed)
            {
                plan.CompletedAt = claim.CompletedAt ?? createdAt.AddDays(_rng.Next(5, 25));
                plan.IsOnTime = plan.Deadline.HasValue
                    ? plan.CompletedAt.Value.Date <= plan.Deadline.Value.Date
                    : null;
                plan.Progress = 100;
            }
            else
            {
                plan.CompletedAt = null;
                plan.IsOnTime = null;
            }

            if (isNew) _ap.ActionPlans.Add(plan);

            // Assignation employé (UAA) — nécessaire pour la MAJ de progression côté front
            var existingAssign = await _ap.UserActionPlanAssignments
                .FirstOrDefaultAsync(
                    a => a.ActionPlanId == plan.Id
                         && a.UserId.ToLower() == assignee.UserId.ToLower(),
                    ct);
            if (existingAssign is null)
            {
                _ap.UserActionPlanAssignments.Add(new UserActionPlanAssignment
                {
                    Id = Guid.NewGuid(),
                    UserId = assignee.UserId,
                    ActionPlanId = plan.Id,
                    CanView = true,
                    CanEdit = true,
                    CreatedAt = createdAt,
                });
            }
            else
            {
                existingAssign.CanView = true;
                existingAssign.CanEdit = true;
            }
        }

        await _ap.SaveChangesAsync(ct);
        Console.WriteLine($"Plans CAPA prêts: {Math.Min(_planCount, candidates.Count)}");
    }

    private ScenarioPick PickScenario()
    {
        // 70% : scénario catalogué ; 30% : défaut pondéré + ligne aléatoire
        if (_rng.NextDouble() < 0.7)
        {
            var s = RealisticClaimCatalog.Scenarios[_rng.Next(RealisticClaimCatalog.Scenarios.Length)];
            return new ScenarioPick(s, s.Line);
        }

        var defect = RealisticClaimCatalog.PickWeighted(_rng, RealisticClaimCatalog.DefectWeights);
        var line = RealisticClaimCatalog.Lines[_rng.Next(RealisticClaimCatalog.Lines.Length)];
        var fallback = RealisticClaimCatalog.Scenarios.FirstOrDefault(x => x.Defect == defect)
                       ?? RealisticClaimCatalog.Scenarios[0];
        return new ScenarioPick(
            fallback with { Line = line, Defect = defect },
            line);
    }

    private static string BuildAnalysisNote(string defect, string line)
        => defect switch
        {
            var d when d.Contains("Soudure", StringComparison.OrdinalIgnoreCase)
                => $"Analyse en cours: paramètres pince / électrodes sur {line}. Contrôle sections micrographiques demandé.",
            var d when d.Contains("Isolation", StringComparison.OrdinalIgnoreCase)
                => $"Vérification guides et tensions de dévidage sur {line}. Échantillon conservé pour labo.",
            var d when d.Contains("sertissage", StringComparison.OrdinalIgnoreCase)
                => "Mesures hauteur/largeur sertissage + courbe force. Outillage à recalibrer si dérive confirmée.",
            _ => $"Investigation process {line}. Comparaison avec lots précédents et retour client.",
        };

    private static string RootCauseOccurrence(string defect)
        => defect switch
        {
            var d when d.Contains("Soudure", StringComparison.OrdinalIgnoreCase)
                => "Dérive paramètres de soudure (pression/temps) liée à usure électrodes non détectée à temps.",
            var d when d.Contains("Isolation", StringComparison.OrdinalIgnoreCase)
                => "Contact mécanique répétitif sur guide d'extrusion / coupe endommageant la gaine.",
            var d when d.Contains("sertissage", StringComparison.OrdinalIgnoreCase)
                => "Réglage hauteur de sertissage hors fenêtre après changement d'applicateur.",
            _ => "Écart process non détecté au poste précédent ; standard de travail incomplet pour ce mode.",
        };

    private async Task PrintSummaryAsync(CancellationToken ct)
    {
        var total = await _ap.Claims.CountAsync(c => !c.IsArchived, ct);
        var byDefect = await _ap.Claims.AsNoTracking()
            .Where(c => !c.IsArchived)
            .GroupBy(c => c.DefectType)
            .Select(g => new { Defect = g.Key, N = g.Count() })
            .OrderByDescending(x => x.N)
            .Take(8)
            .ToListAsync(ct);

        Console.WriteLine();
        Console.WriteLine($"Total réclamations actives en base: {total}");
        foreach (var row in byDefect)
            Console.WriteLine($"  {row.N,4}  {row.Defect}");
    }

    private static DateTime StartOfWeek(DateTime dt)
    {
        var utc = dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        var diff = ((int)utc.DayOfWeek + 6) % 7;
        return new DateTime(utc.Year, utc.Month, utc.Day, 0, 0, 0, DateTimeKind.Utc).AddDays(-diff);
    }

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..(max - 1)] + "…";

    private readonly record struct ScenarioPick(RealisticClaimCatalog.Scenario Scenario, string Line);
}

internal static class DemoIds
{
    public static Guid For(string key)
    {
        var hash = MD5.HashData(Encoding.UTF8.GetBytes("coficab-demo-v1:" + key));
        hash[6] = (byte)((hash[6] & 0x0F) | 0x40);
        hash[8] = (byte)((hash[8] & 0x3F) | 0x80);
        return new Guid(hash);
    }

    public static Guid Claim(int i) => For($"claim:{i:0000}");
    public static Guid Plan(int i) => For($"plan:{i:0000}");
    public static Guid FiveWhy(int i) => For($"fivewhy:{i:0000}");
}
