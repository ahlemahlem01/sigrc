using System.Net.Http.Headers;
using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.DTOs.Employee;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;

namespace Coficab.ActionPlan.Application.Services;

public class EmployeeActivityService : IEmployeeActivityService
{
    private static readonly TimeSpan StaleAfter = TimeSpan.FromHours(6);

    private readonly IApplicationDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmployeeActivityService> _logger;

    public EmployeeActivityService(
        IApplicationDbContext db,
        IHttpClientFactory httpClientFactory,
        IHttpContextAccessor httpContextAccessor,
        IConfiguration configuration,
        ILogger<EmployeeActivityService> logger)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _httpContextAccessor = httpContextAccessor;
        _configuration = configuration;
        _logger = logger;
    }

    public ActivityStatus ComputeStatus(DateTime? lastActivityUtc, DateTime utcNow)
    {
        if (lastActivityUtc == null)
            return ActivityStatus.Inactive;

        // Jours calendaires (pas fractionnaires) : ≤15 / ≤60
        var days = (utcNow.Date - lastActivityUtc.Value.ToUniversalTime().Date).TotalDays;
        if (days <= 15) return ActivityStatus.Active;
        if (days <= 60) return ActivityStatus.LowActivity;
        return ActivityStatus.Inactive;
    }

    public async Task RecalculateUserAsync(string userId, DateTime? lastLoginAt = null, CancellationToken ct = default)
    {
        var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == userId, ct);
        if (profile == null) return;

        var business = await GetBusinessActivityMetricsAsync(new[] { userId }, ct);
        business.TryGetValue(userId, out var metric);
        var businessAt = metric?.LastAt;

        DateTime? login = lastLoginAt;
        if (login == null)
        {
            var logins = await FetchLastLoginsAsync(ct);
            logins.TryGetValue(userId, out login);
            if (login == null && !string.IsNullOrWhiteSpace(profile.Email))
                logins.TryGetValue(profile.Email.Trim().ToLowerInvariant(), out login);
        }

        login ??= profile.LastLoginAt;
        var last = MaxDate(login, businessAt);
        var now = DateTime.UtcNow;

        profile.LastLoginAt = login ?? profile.LastLoginAt;
        profile.LastActivityAt = last;
        profile.ActivityStatus = ComputeStatus(last, now);
        profile.ActivityStatusComputedAt = now;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<EmployeeActivitySummaryDto> GetSummaryAsync(bool forceRecalculate = false, CancellationToken ct = default)
    {
        if (forceRecalculate)
            return await RecalculateAllAsync(ct);

        var profiles = await _db.UserProfiles.AsNoTracking().ToListAsync(ct);
        var newest = profiles
            .Select(p => p.ActivityStatusComputedAt)
            .Where(d => d != null)
            .DefaultIfEmpty()
            .Max();

        var stale = newest == null
            || DateTime.UtcNow - newest.Value > StaleAfter
            || profiles.Any(p => p.ActivityStatusComputedAt == null)
            || profiles.Any(p => p.LastLoginAt == null);

        if (stale)
            return await RecalculateAllAsync(ct);

        var deptIds = profiles.Where(p => p.DepartmentId != null).Select(p => p.DepartmentId!.Value).Distinct().ToList();
        var deptNames = deptIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Departments.AsNoTracking()
                .Where(d => deptIds.Contains(d.Id))
                .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        return BuildSummary(profiles, null, deptNames);
    }

    /// <summary>
    /// Activity of one stream only: "plans" (plans, their sub-actions and assignments) or "claims" (claims). Analyses,
    /// timeline and logins do not count, and the stored (global) status of the profiles is left untouched.
    /// </summary>
    public async Task<EmployeeActivitySummaryDto> GetScopedSummaryAsync(string scope, CancellationToken ct = default)
    {
        var profiles = await _db.UserProfiles.AsNoTracking().ToListAsync(ct);
        var metrics = await GetBusinessActivityMetricsAsync(profiles.Select(p => p.UserId).Distinct().ToList(), ct, scope);
        var now = DateTime.UtcNow;

        var deptIds = profiles.Where(p => p.DepartmentId != null).Select(p => p.DepartmentId!.Value).Distinct().ToList();
        var deptNames = deptIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Departments.AsNoTracking()
                .Where(d => deptIds.Contains(d.Id))
                .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        foreach (var p in profiles)
        {
            metrics.TryGetValue(p.UserId, out var metric);
            p.LastActivityAt = metric?.LastAt;
            p.ActivityStatus = ComputeStatus(metric?.LastAt, now);
            p.ActivityStatusComputedAt = now;
        }

        return BuildSummary(profiles, metrics, deptNames);
    }

    public async Task<EmployeeActivitySummaryDto> RecalculateAllAsync(CancellationToken ct = default)
    {
        var profiles = await _db.UserProfiles.ToListAsync(ct);
        if (profiles.Count == 0)
        {
            return new EmployeeActivitySummaryDto
            {
                ComputedAt = DateTime.UtcNow,
                Items = Array.Empty<EmployeeActivityItemDto>(),
            };
        }

        var userIds = profiles.Select(p => p.UserId).Distinct().ToList();
        var logins = await FetchLastLoginsAsync(ct);
        var metrics = await GetBusinessActivityMetricsAsync(userIds, ct);
        var now = DateTime.UtcNow;

        _logger.LogInformation(
            "Activity recalculate: {ProfileCount} profiles, {LoginCount} logins synced, business keys={BusinessCount}",
            profiles.Count, logins.Count, metrics.Count(kv => kv.Value.LastAt != null));

        foreach (var profile in profiles)
        {
            logins.TryGetValue(profile.UserId, out var loginAt);
            if (loginAt == null && !string.IsNullOrWhiteSpace(profile.Email))
                logins.TryGetValue(profile.Email.Trim().ToLowerInvariant(), out loginAt);

            metrics.TryGetValue(profile.UserId, out var metric);
            var businessAt = metric?.LastAt;

            if (loginAt != null)
                profile.LastLoginAt = loginAt;

            var last = MaxDate(profile.LastLoginAt, businessAt);
            profile.LastActivityAt = last;
            profile.ActivityStatus = ComputeStatus(last, now);
            profile.ActivityStatusComputedAt = now;
        }

        await _db.SaveChangesAsync(ct);

        var deptIds = profiles.Where(p => p.DepartmentId != null).Select(p => p.DepartmentId!.Value).Distinct().ToList();
        var deptNames = deptIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Departments.AsNoTracking()
                .Where(d => deptIds.Contains(d.Id))
                .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        return BuildSummary(profiles, metrics, deptNames);
    }

    private sealed class BusinessActivityMetric
    {
        public DateTime? LastAt { get; set; }
        public int RecentCount { get; set; }
    }

    private EmployeeActivitySummaryDto BuildSummary(
        IEnumerable<Core.Entities.UserProfile> profiles,
        Dictionary<string, BusinessActivityMetric>? businessMap,
        IReadOnlyDictionary<Guid, string>? deptNames = null)
    {
        var items = profiles
            .Select(p =>
            {
                BusinessActivityMetric? metric = null;
                businessMap?.TryGetValue(p.UserId, out metric);
                var dept = p.Department?.Name
                    ?? (p.DepartmentId != null && deptNames != null && deptNames.TryGetValue(p.DepartmentId.Value, out var n) ? n : string.Empty);
                return new EmployeeActivityItemDto
                {
                    UserId = p.UserId,
                    Name = p.Name,
                    Email = p.Email,
                    Department = dept,
                    Role = p.Role,
                    ActivityStatus = p.ActivityStatus,
                    LastActivityAt = p.LastActivityAt,
                    LastLoginAt = p.LastLoginAt,
                    LastBusinessActivityAt = metric?.LastAt,
                    ActivityStatusComputedAt = p.ActivityStatusComputedAt,
                    RecentActionCount = metric?.RecentCount ?? 0,
                };
            })
            .OrderByDescending(i => i.RecentActionCount)
            .ThenBy(i => i.ActivityStatus)
            .ThenBy(i => i.Name)
            .ToList();

        return new EmployeeActivitySummaryDto
        {
            Total = items.Count,
            Active = items.Count(i => i.ActivityStatus == ActivityStatus.Active),
            LowActivity = items.Count(i => i.ActivityStatus == ActivityStatus.LowActivity),
            Inactive = items.Count(i => i.ActivityStatus == ActivityStatus.Inactive),
            ComputedAt = items.Select(i => i.ActivityStatusComputedAt).Where(d => d != null).DefaultIfEmpty().Max(),
            Items = items,
        };
    }

    private async Task<Dictionary<string, BusinessActivityMetric>> GetBusinessActivityMetricsAsync(
        IReadOnlyCollection<string> userIds,
        CancellationToken ct,
        string? scope = null)
    {
        var set = userIds.Where(id => !string.IsNullOrWhiteSpace(id)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var map = set.ToDictionary(id => id, _ => new BusinessActivityMetric(), StringComparer.OrdinalIgnoreCase);

        var emailToUserId = await _db.UserProfiles.AsNoTracking()
            .Where(p => set.Contains(p.UserId) && p.Email != null && p.Email != "")
            .Select(p => new { p.UserId, p.Email })
            .ToListAsync(ct);

        var aliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in emailToUserId)
        {
            aliases[row.UserId] = row.UserId;
            aliases[row.Email.Trim()] = row.UserId;
            aliases[row.Email.Trim().ToLowerInvariant()] = row.UserId;
        }

        var recentFrom = DateTime.UtcNow.Date.AddDays(-60);

        void Consider(string? actor, DateTime? at)
        {
            if (string.IsNullOrWhiteSpace(actor) || at == null) return;
            if (!aliases.TryGetValue(actor.Trim(), out var userId)) return;
            var utc = at.Value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(at.Value, DateTimeKind.Utc)
                : at.Value.ToUniversalTime();
            var m = map[userId];
            m.LastAt = MaxDate(m.LastAt, utc);
            if (utc.Date >= recentFrom)
                m.RecentCount++;
        }

        var plansScope = string.Equals(scope, "plans", StringComparison.OrdinalIgnoreCase);
        var claimsScope = string.Equals(scope, "claims", StringComparison.OrdinalIgnoreCase);

        if (!claimsScope)
        {
            var plans = await _db.ActionPlans.AsNoTracking().Where(p => !p.IsArchived)
                .Select(p => new { p.OwnerId, p.CreatedBy, p.UpdatedBy, p.CreatedAt, p.UpdatedAt })
                .ToListAsync(ct);
            foreach (var p in plans)
            {
                Consider(p.OwnerId, MaxDate(p.CreatedAt, p.UpdatedAt));
                Consider(p.CreatedBy, p.CreatedAt);
                Consider(p.UpdatedBy, p.UpdatedAt);
            }

            var planActions = await _db.PlanActions.AsNoTracking().Where(a => !a.IsArchived)
                .Select(a => new { a.AssignedToId, a.CreatedBy, a.UpdatedBy, a.CreatedAt, a.UpdatedAt })
                .ToListAsync(ct);
            foreach (var a in planActions)
            {
                Consider(a.CreatedBy, a.CreatedAt);
                Consider(a.UpdatedBy, a.UpdatedAt);
                if (!string.IsNullOrWhiteSpace(a.UpdatedBy) &&
                    string.Equals(a.UpdatedBy, a.AssignedToId, StringComparison.OrdinalIgnoreCase))
                    Consider(a.AssignedToId, a.UpdatedAt);
            }

            var assignments = await _db.UserActionPlanAssignments.AsNoTracking()
                .Select(a => new { a.UserId, a.CreatedAt }).ToListAsync(ct);
            foreach (var a in assignments)
                Consider(a.UserId, a.CreatedAt);
        }

        if (plansScope) return map;

        var claims = await _db.Claims.AsNoTracking().Where(c => !c.IsArchived)
            .Select(c => new { c.CreatedById, c.UpdatedById, c.CreatedBy, c.CreatedAt, c.UpdatedAt })
            .ToListAsync(ct);
        foreach (var c in claims)
        {
            Consider(c.CreatedById, MaxDate(c.CreatedAt, c.UpdatedAt));
            Consider(c.CreatedBy, c.CreatedAt);
            Consider(c.UpdatedById, c.UpdatedAt);
        }

        // the rest concerns claim analyses and logs, which neither stream counts
        if (claimsScope) return map;

        var eightD = await _db.EightDDossiers.AsNoTracking().Where(d => !d.IsArchived)
            .Select(d => new
            {
                d.ChampionId, d.ClosedById, d.SubmittedById, d.ValidatedById,
                d.UpdatedBy, d.CreatedBy, d.CreatedAt, d.UpdatedAt, d.ClosedAt, d.SubmittedAt, d.ValidatedAt,
            }).ToListAsync(ct);
        foreach (var d in eightD)
        {
            Consider(d.CreatedBy, d.CreatedAt);
            Consider(d.UpdatedBy, d.UpdatedAt);
            Consider(d.ClosedById, d.ClosedAt);
            Consider(d.SubmittedById, d.SubmittedAt);
            Consider(d.ValidatedById, d.ValidatedAt);
            Consider(d.ChampionId, MaxDate(d.CreatedAt, d.UpdatedAt, d.SubmittedAt, d.ClosedAt, d.ValidatedAt));
        }

        var fiveWhy = await _db.FiveWhyAnalyses.AsNoTracking()
            .Select(f => new { f.CreatedBy, f.CreatedAt }).ToListAsync(ct);
        foreach (var f in fiveWhy)
            Consider(f.CreatedBy, f.CreatedAt);

        var ishikawa = await _db.IshikawaAnalyses.AsNoTracking()
            .Select(i => new { i.CreatedBy, i.CreatedAt }).ToListAsync(ct);
        foreach (var i in ishikawa)
            Consider(i.CreatedBy, i.CreatedAt);

        var causes = await _db.IshikawaCauses.AsNoTracking()
            .Select(c => new { c.CreatedBy, c.CreatedAt }).ToListAsync(ct);
        foreach (var c in causes)
            Consider(c.CreatedBy, c.CreatedAt);

        var timeline = await _db.TimelineEvents.AsNoTracking()
            .Select(t => new { t.UserId, t.Timestamp }).ToListAsync(ct);
        foreach (var t in timeline)
            Consider(t.UserId, t.Timestamp);

        return map;
    }

    private async Task<Dictionary<string, DateTime?>> FetchLastLoginsAsync(CancellationToken ct)
    {
        var result = new Dictionary<string, DateTime?>(StringComparer.OrdinalIgnoreCase);

        await TryFetchLastLoginsFromAuthDbAsync(result, ct);

        return result;
    }

    private async Task TryFetchLastLoginsFromAuthHttpAsync(
        Dictionary<string, DateTime?> result,
        CancellationToken ct)
    {
        try
        {
            var authBase = _configuration["AuthApi:BaseUrl"]
                ?? _configuration["Jwt:Authority"]
                ?? _configuration["Auth:Authority"]
                ?? "https://localhost:7102";
            authBase = authBase.TrimEnd('/');

            var authHeader = _httpContextAccessor.HttpContext?.Request.Headers.Authorization.ToString();
            if (string.IsNullOrWhiteSpace(authHeader))
                return;

            var client = _httpClientFactory.CreateClient("AuthApi");
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{authBase}/api/admin/users");
            req.Headers.Authorization = AuthenticationHeaderValue.Parse(authHeader);

            using var resp = await client.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Impossible de récupérer lastLoginAt depuis Auth HTTP ({Status})", resp.StatusCode);
                return;
            }

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return;

            foreach (var el in doc.RootElement.EnumerateArray())
                MergeLogin(result, el);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Échec de synchronisation lastLoginAt via Auth HTTP");
        }
    }

    private async Task TryFetchLastLoginsFromAuthDbAsync(
        Dictionary<string, DateTime?> result,
        CancellationToken ct)
    {
        var cs = _configuration.GetConnectionString("AuthDb")
            ?? _configuration["AuthApi:ConnectionString"];
        if (!string.IsNullOrWhiteSpace(cs)) cs = Coficab.Auth.API.Data.SqlConnectionResilience.WithDefaults(cs);
        if (string.IsNullOrWhiteSpace(cs))
        {
            _logger.LogWarning("AuthDb connection string absente — LastLoginAt non synchronisé hors requête admin");
            return;
        }

        try
        {
            await using var conn = new SqlConnection(cs);
            await conn.OpenAsync(ct);
            // LastLoginAt colonne OU dernier LOGIN dans AuditLogs (rétroactif)
            await using var cmd = new SqlCommand(
                """
                SELECT u.Id, u.Email, u.LastLoginAt
                FROM app_auth.AspNetUsers u
                """,
                conn);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var synced = 0;
            while (await reader.ReadAsync(ct))
            {
                var id = reader.IsDBNull(0) ? null : reader.GetString(0);
                var email = reader.IsDBNull(1) ? null : reader.GetString(1);
                var login = reader.IsDBNull(2) ? (DateTime?)null : reader.GetDateTime(2);
                if (login == null) continue;

                void Put(string key, DateTime value)
                {
                    if (result.TryGetValue(key, out var existing) && existing != null && existing >= value)
                        return;
                    result[key] = value;
                }

                if (!string.IsNullOrWhiteSpace(id)) Put(id, login.Value);
                if (!string.IsNullOrWhiteSpace(email)) Put(email.Trim().ToLowerInvariant(), login.Value);
                synced++;
            }

            _logger.LogInformation("LastLoginAt synchronisé depuis AuthDb+Audit ({Count} utilisateurs)", synced);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Échec de synchronisation lastLoginAt via AuthDb");
        }
    }

    private static void MergeLogin(Dictionary<string, DateTime?> result, JsonElement el)
    {
        var id = el.TryGetProperty("id", out var idProp) ? idProp.GetString()
            : el.TryGetProperty("Id", out var idProp2) ? idProp2.GetString()
            : null;
        var email = el.TryGetProperty("email", out var em) ? em.GetString()
            : el.TryGetProperty("Email", out var em2) ? em2.GetString()
            : null;

        DateTime? login = null;
        if (el.TryGetProperty("lastLoginAt", out var ll) && ll.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
            login = ll.GetDateTime();
        else if (el.TryGetProperty("LastLoginAt", out var ll2) && ll2.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
            login = ll2.GetDateTime();

        if (login == null) return;
        if (!string.IsNullOrWhiteSpace(id)) result[id] = login;
        if (!string.IsNullOrWhiteSpace(email)) result[email.Trim().ToLowerInvariant()] = login;
    }

    private static DateTime? MaxDate(params DateTime?[] dates)
    {
        DateTime? max = null;
        foreach (var d in dates)
        {
            if (d == null) continue;
            var utc = DateTime.SpecifyKind(d.Value, d.Value.Kind == DateTimeKind.Unspecified ? DateTimeKind.Utc : d.Value.Kind)
                .ToUniversalTime();
            if (max == null || utc > max) max = utc;
        }
        return max;
    }
}
