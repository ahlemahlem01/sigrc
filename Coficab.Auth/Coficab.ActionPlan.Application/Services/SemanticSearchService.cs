using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

public record SemanticSearchHitDto(
    Guid EntityId,
    string EntityType,
    double Score,
    string? Title,
    string? Snippet);

public record SemanticSearchResultDto(
    string Query,
    IReadOnlyList<SemanticSearchHitDto> Claims,
    IReadOnlyList<SemanticSearchHitDto> ActionPlans);

public interface ISemanticSearchService
{
    Task UpsertClaimAsync(Claim claim, CancellationToken cancellationToken = default);
    Task UpsertActionPlanAsync(Core.Entities.ActionPlan plan, CancellationToken cancellationToken = default);
    Task<SemanticSearchResultDto> SearchAsync(
        string query,
        int topK = 25,
        string? scopeUserId = null,
        bool adminScope = false,
        CancellationToken cancellationToken = default);
    Task<int> BackfillMissingAsync(int maxItems = 200, CancellationToken cancellationToken = default);
}

public class SemanticSearchService : ISemanticSearchService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = null };

    private readonly IApplicationDbContext _db;
    private readonly IGeminiService _gemini;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SemanticSearchService> _logger;

    public SemanticSearchService(
        IApplicationDbContext db,
        IGeminiService gemini,
        IConfiguration configuration,
        ILogger<SemanticSearchService> logger)
    {
        _db = db;
        _gemini = gemini;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task UpsertClaimAsync(Claim claim, CancellationToken cancellationToken = default)
    {
        var text = BuildClaimText(claim);
        await UpsertAsync(SemanticEntityTypes.Claim, claim.Id, text, cancellationToken);
    }

    public async Task UpsertActionPlanAsync(Core.Entities.ActionPlan plan, CancellationToken cancellationToken = default)
    {
        var text = BuildPlanText(plan);
        await UpsertAsync(SemanticEntityTypes.ActionPlan, plan.Id, text, cancellationToken);
    }

    public async Task<SemanticSearchResultDto> SearchAsync(
        string query,
        int topK = 25,
        string? scopeUserId = null,
        bool adminScope = false,
        CancellationToken cancellationToken = default)
    {
        var q = (query ?? string.Empty).Trim();
        if (q.Length == 0)
            return new SemanticSearchResultDto(q, Array.Empty<SemanticSearchHitDto>(), Array.Empty<SemanticSearchHitDto>());

        topK = Math.Clamp(topK, 1, 50);

        // No embedding work on the search path: the background service already back-fills missing vectors,
        // and doing it here added several Gemini round trips to every search.

        var claimHits = new List<SemanticSearchHitDto>();
        var planHits = new List<SemanticSearchHitDto>();

        try
        {
            var queryVector = Normalize(await GetQueryVectorAsync(q, cancellationToken));
            var index = await GetIndexAsync(cancellationToken);

            // Stored vectors are normalised once when the index is built, so a score is a plain dot product.
            var scored = new List<(IndexRow Row, double Score)>();
            foreach (var row in index)
            {
                if (row.Vector.Length == 0 || row.Vector.Length != queryVector.Length) continue;
                double score = 0;
                for (var i = 0; i < queryVector.Length; i++) score += queryVector[i] * row.Vector[i];
                if (score <= 0.05) continue;
                scored.Add((row, score));
            }

            var claimIds = scored
                .Where(x => x.Row.EntityType == SemanticEntityTypes.Claim)
                .OrderByDescending(x => x.Score)
                .Select(x => x.Row.EntityId)
                .Distinct()
                .Take(topK * 2)
                .ToList();

            var planIds = scored
                .Where(x => x.Row.EntityType == SemanticEntityTypes.ActionPlan)
                .OrderByDescending(x => x.Score)
                .Select(x => x.Row.EntityId)
                .Distinct()
                .Take(topK * 2)
                .ToList();

            var claimScore = scored
                .Where(x => x.Row.EntityType == SemanticEntityTypes.Claim)
                .GroupBy(x => x.Row.EntityId)
                .ToDictionary(g => g.Key, g => g.Max(x => x.Score));

            var planScore = scored
                .Where(x => x.Row.EntityType == SemanticEntityTypes.ActionPlan)
                .GroupBy(x => x.Row.EntityId)
                .ToDictionary(g => g.Key, g => g.Max(x => x.Score));

            var claimsQuery = _db.Claims.AsNoTracking().Where(c => !c.IsArchived && claimIds.Contains(c.Id));
            claimsQuery = ApplyClaimScope(claimsQuery, scopeUserId, adminScope);

            var claims = await claimsQuery.ToListAsync(cancellationToken);
            claimHits = claims
                .Select(c => new SemanticSearchHitDto(
                    c.Id,
                    SemanticEntityTypes.Claim,
                    claimScore.GetValueOrDefault(c.Id),
                    c.Title,
                    Truncate(c.Description, 180)))
                .OrderByDescending(h => h.Score)
                .Take(topK)
                .ToList();

            var plansQuery = _db.ActionPlans.AsNoTracking().Where(p => !p.IsArchived && planIds.Contains(p.Id));
            plansQuery = ApplyPlanScope(plansQuery, scopeUserId, adminScope);

            var plans = await plansQuery.ToListAsync(cancellationToken);
            planHits = plans
                .Select(p => new SemanticSearchHitDto(
                    p.Id,
                    SemanticEntityTypes.ActionPlan,
                    planScore.GetValueOrDefault(p.Id),
                    p.Title,
                    Truncate(p.Description, 180)))
                .OrderByDescending(h => h.Score)
                .Take(topK)
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Semantic ranking failed; falling back to lexical search");
        }

        // Lexical fallback when embeddings miss (empty index / unrelated query / API error).
        if (claimHits.Count == 0)
            claimHits = await LexicalClaimSearchAsync(q, topK, scopeUserId, adminScope, cancellationToken);

        return new SemanticSearchResultDto(q, claimHits, planHits);
    }


    private sealed record IndexRow(string EntityType, Guid EntityId, float[] Vector);

    private static readonly object IndexLock = new();
    private static (int Count, DateTime LastUpdate, List<IndexRow> Rows)? _index;
    private static readonly ConcurrentDictionary<string, float[]> QueryVectors = new(StringComparer.OrdinalIgnoreCase);
    private const int MaxCachedQueries = 256;

    /// <summary>Same question asked again (typing, backspace, retry) does not call the embedding API again.</summary>
    private async Task<float[]> GetQueryVectorAsync(string query, CancellationToken cancellationToken)
    {
        if (QueryVectors.TryGetValue(query, out var cached)) return cached;
        var vector = await _gemini.EmbedAsync(query, forQuery: true, cancellationToken);
        if (QueryVectors.Count >= MaxCachedQueries) QueryVectors.Clear();
        QueryVectors[query] = vector;
        return vector;
    }

    /// <summary>
    /// The parsed vectors stay in memory and are rebuilt only when the stored embeddings changed
    /// (row count or latest update). A search used to download and parse every vector each time.
    /// </summary>
    private async Task<List<IndexRow>> GetIndexAsync(CancellationToken cancellationToken)
    {
        var typed = _db.SemanticEmbeddings.AsNoTracking()
            .Where(e => e.EntityType == SemanticEntityTypes.Claim || e.EntityType == SemanticEntityTypes.ActionPlan);
        var stats = await typed.GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Last = g.Max(e => e.UpdatedAt) })
            .FirstOrDefaultAsync(cancellationToken);
        var count = stats?.Count ?? 0;
        var last = stats?.Last ?? DateTime.MinValue;

        lock (IndexLock)
        {
            if (_index is { } current && current.Count == count && current.LastUpdate == last) return current.Rows;
        }

        var rows = (await typed
                .Select(e => new { e.EntityType, e.EntityId, e.EmbeddingJson })
                .ToListAsync(cancellationToken))
            .Select(e => new IndexRow(e.EntityType, e.EntityId, Normalize(Deserialize(e.EmbeddingJson))))
            .ToList();

        lock (IndexLock) { _index = (count, last, rows); }
        return rows;
    }

    private static float[] Normalize(float[] vector)
    {
        double norm = 0;
        foreach (var v in vector) norm += v * v;
        if (norm <= 0) return vector;
        var factor = (float)(1.0 / Math.Sqrt(norm));
        var result = new float[vector.Length];
        for (var i = 0; i < vector.Length; i++) result[i] = vector[i] * factor;
        return result;
    }

    private static IQueryable<Claim> ApplyClaimScope(
        IQueryable<Claim> query, string? scopeUserId, bool adminScope)
    {
        if (adminScope || string.IsNullOrWhiteSpace(scopeUserId)) return query;
        var uid = scopeUserId.Trim().ToLowerInvariant();
        return query.Where(c =>
            (c.AssignedToId != null && c.AssignedToId.ToLower() == uid)
            || (c.CreatedById != null && c.CreatedById.ToLower() == uid));
    }

    private static IQueryable<Core.Entities.ActionPlan> ApplyPlanScope(
        IQueryable<Core.Entities.ActionPlan> query, string? scopeUserId, bool adminScope)
    {
        if (adminScope || string.IsNullOrWhiteSpace(scopeUserId)) return query;
        var uid = scopeUserId.Trim().ToLowerInvariant();
        return query.Where(p =>
            (p.AssignedToId != null && p.AssignedToId.ToLower() == uid)
            || (p.OwnerId != null && p.OwnerId.ToLower() == uid)
            || p.UserAssignments.Any(a => a.UserId.ToLower() == uid));
    }

    private async Task<List<SemanticSearchHitDto>> LexicalClaimSearchAsync(
        string query,
        int topK,
        string? scopeUserId,
        bool adminScope,
        CancellationToken cancellationToken)
    {
        var tokens = query
            .Split(new[] { ' ', '\t', ',', ';', '-', '/', '\\', '\'', '"' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim().ToLowerInvariant())
            .Where(t => t.Length >= 3)
            .Distinct()
            .Take(6)
            .ToList();

        if (tokens.Count == 0) return new List<SemanticSearchHitDto>();

        var q = ApplyClaimScope(_db.Claims.AsNoTracking().Where(c => !c.IsArchived), scopeUserId, adminScope);
        var candidates = await q
            .OrderByDescending(c => c.CreatedAt)
            .Take(400)
            .ToListAsync(cancellationToken);

        return candidates
            .Select(c =>
            {
                var hay = $"{c.Title} {c.Description} {c.DefectType} {c.ClientId} {c.LotNumber} {c.ProductionLine}"
                    .ToLowerInvariant();
                var hits = tokens.Count(t => hay.Contains(t));
                var score = hits / (double)tokens.Count;
                return (Claim: c, Score: score, Hits: hits);
            })
            .Where(x => x.Hits > 0)
            .OrderByDescending(x => x.Score)
            .ThenByDescending(x => x.Claim.CreatedAt)
            .Take(topK)
            .Select(x => new SemanticSearchHitDto(
                x.Claim.Id,
                SemanticEntityTypes.Claim,
                Math.Max(0.1, x.Score),
                x.Claim.Title,
                Truncate(x.Claim.Description, 180)))
            .ToList();
    }

    public async Task<int> BackfillMissingAsync(int maxItems = 200, CancellationToken cancellationToken = default)
    {
        maxItems = Math.Clamp(maxItems, 1, 500);
        var existingClaimIds = await _db.SemanticEmbeddings.AsNoTracking()
            .Where(e => e.EntityType == SemanticEntityTypes.Claim)
            .Select(e => e.EntityId)
            .ToListAsync(cancellationToken);
        var existingPlanIds = await _db.SemanticEmbeddings.AsNoTracking()
            .Where(e => e.EntityType == SemanticEntityTypes.ActionPlan)
            .Select(e => e.EntityId)
            .ToListAsync(cancellationToken);

        var claims = await _db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && !existingClaimIds.Contains(c.Id))
            .OrderByDescending(c => c.CreatedAt)
            .Take(maxItems / 2)
            .ToListAsync(cancellationToken);

        var plans = await _db.ActionPlans.AsNoTracking()
            .Where(p => !p.IsArchived && !existingPlanIds.Contains(p.Id))
            .OrderByDescending(p => p.CreatedAt)
            .Take(maxItems / 2)
            .ToListAsync(cancellationToken);

        var n = 0;
        foreach (var c in claims)
        {
            try
            {
                await UpsertClaimAsync(c, cancellationToken);
                n++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Backfill claim embedding failed for {Id}", c.Id);
            }
        }

        foreach (var p in plans)
        {
            try
            {
                await UpsertActionPlanAsync(p, cancellationToken);
                n++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Backfill plan embedding failed for {Id}", p.Id);
            }
        }

        return n;
    }

    private async Task UpsertAsync(
        string entityType,
        Guid entityId,
        string text,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        var hash = Sha256(text);
        var existing = await _db.SemanticEmbeddings
            .FirstOrDefaultAsync(e => e.EntityType == entityType && e.EntityId == entityId, cancellationToken);

        if (existing != null && string.Equals(existing.ContentHash, hash, StringComparison.OrdinalIgnoreCase))
            return;

        float[] vector;
        try
        {
            vector = await _gemini.EmbedAsync(text, forQuery: false, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Embedding failed for {Type}/{Id}", entityType, entityId);
            return;
        }

            var model = _configuration["Gemini:EmbeddingModel"] ?? "gemini-embedding-001";
        var json = JsonSerializer.Serialize(vector, JsonOpts);
        var now = DateTime.UtcNow;

        if (existing == null)
        {
            _db.SemanticEmbeddings.Add(new SemanticEmbedding
            {
                EntityType = entityType,
                EntityId = entityId,
                ContentHash = hash,
                Model = model,
                EmbeddingJson = json,
                EmbeddedAt = now,
                UpdatedAt = now,
            });
        }
        else
        {
            existing.ContentHash = hash;
            existing.Model = model;
            existing.EmbeddingJson = json;
            existing.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public static string BuildClaimText(Claim claim)
    {
        var sb = new StringBuilder();
        sb.AppendLine(claim.Title ?? string.Empty);
        sb.AppendLine(claim.Description ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(claim.ClientId)) sb.AppendLine($"Client: {claim.ClientId}");
        if (!string.IsNullOrWhiteSpace(claim.DefectType)) sb.AppendLine($"Défaut: {claim.DefectType}");
        if (!string.IsNullOrWhiteSpace(claim.Severity)) sb.AppendLine($"Sévérité: {claim.Severity}");
        if (!string.IsNullOrWhiteSpace(claim.ProductionLine)) sb.AppendLine($"Ligne: {claim.ProductionLine}");
        if (!string.IsNullOrWhiteSpace(claim.LotNumber)) sb.AppendLine($"Lot: {claim.LotNumber}");
        return sb.ToString().Trim();
    }

    public static string BuildPlanText(Core.Entities.ActionPlan plan)
    {
        var sb = new StringBuilder();
        sb.AppendLine(plan.Title ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(plan.Description)) sb.AppendLine(plan.Description);
        sb.AppendLine($"Type: {plan.Type}");
        sb.AppendLine($"Statut: {plan.Status}");
        return sb.ToString().Trim();
    }

    private static float[] Deserialize(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<float[]>(json) ?? Array.Empty<float>();
        }
        catch
        {
            return Array.Empty<float>();
        }
    }

    private static double CosineSimilarity(float[] a, float[] b)
    {
        if (a.Length == 0 || b.Length == 0 || a.Length != b.Length) return 0;
        double dot = 0, na = 0, nb = 0;
        for (var i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na <= 0 || nb <= 0) return 0;
        return dot / (Math.Sqrt(na) * Math.Sqrt(nb));
    }

    private static string Sha256(string text)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(text));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var t = value.Trim();
        return t.Length <= max ? t : t[..max] + "…";
    }
}
