using Coficab.ActionPlan.Application.DTOs.Pareto;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.ReferenceLists;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.Infrastructure.Services;

public class ParetoService : IParetoService
{
    /// <summary>Employees never see a group of fewer dossiers than this (re-identification guard).</summary>
    public const int MinGroupSize = 3;
    /// <summary>Below this many comparable dossiers no axis is recommended (manual use stays possible).</summary>
    public const int MinSampleForSuggestion = 8;
    /// <summary>An axis needs at least this many categories in the whole history to be compared with it.</summary>
    public const int MinBaselineCategories = 3;
    /// <summary>Two axes whose effect sizes differ by less than this are considered tied (the larger sample wins).</summary>
    private const double TieBand = 0.05;
    private const string UnknownLabel = "Non renseigné";
    private const string OtherLabel = "Autres";

    private readonly IApplicationDbContext _context;

    public ParetoService(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<ParetoItemDto>> GetParetoAsync(ParetoRequestDto request, bool restrictSmallGroups = false)
    {
        var items = await GetRawAsync(request);
        return restrictSmallGroups ? RestrictSmallGroups(items, request.Measure) : items;
    }

    private async Task<List<ParetoItemDto>> GetRawAsync(ParetoRequestDto request)
    {
        var defectTypes = await DefectTypeResolver.LoadAsync(_context, default);
        var baseClaims = await BaseClaimsAsync();
        var variants = await VariantsAsync(baseClaims, defectTypes, request.DefectType);
        var query = ApplyFilters(baseClaims, request, variants);
        return await BuildParetoAsync(query, request.Dimension, request.Measure, defectTypes);
    }

    /// <summary>Every spelling used by the claims that counts as the requested defect type (the kept name and its aliases).</summary>
    private static async Task<IReadOnlyCollection<string>?> VariantsAsync(
        IQueryable<Core.Entities.Claim> claims, DefectTypeResolver defectTypes, string? requested)
    {
        if (string.IsNullOrWhiteSpace(requested)) return null;
        var target = defectTypes.Resolve(requested);
        var used = await claims.Select(c => c.DefectType).Distinct().ToListAsync();
        var variants = used.Where(u => string.Equals(defectTypes.Resolve(u), target, StringComparison.Ordinal)).ToList();
        if (!variants.Contains(requested)) variants.Add(requested);
        return variants;
    }

    private Task<IQueryable<Core.Entities.Claim>> BaseClaimsAsync() => HistoryScope.ClaimsAsync(_context);

    private static bool IsImpact(string? measure) => string.Equals(measure, "impact", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Aggregates only: groups under <see cref="MinGroupSize"/> dossiers are merged into "Autres"
    /// (dropped if still too small), so a single dossier can never be singled out.
    /// </summary>
    private static List<ParetoItemDto> RestrictSmallGroups(List<ParetoItemDto> items, string? measure)
    {
        if (items.Sum(i => i.Count) < MinGroupSize) return new List<ParetoItemDto>();

        var kept = items.Where(i => i.Count >= MinGroupSize).Select(i => (i.Category, i.Count, i.Impact)).ToList();
        var small = items.Where(i => i.Count < MinGroupSize).ToList();
        if (small.Sum(i => i.Count) >= MinGroupSize)
            kept.Add((OtherLabel, small.Sum(i => i.Count), small.Sum(i => i.Impact)));

        return Rank(kept, measure);
    }

    /// <summary>Sorts by the chosen measure and computes shares, cumulative share and the "vital few" (up to 80 %).</summary>
    private static List<ParetoItemDto> Rank(List<(string Category, int Count, double Impact)> groups, string? measure)
    {
        var impact = IsImpact(measure);
        var ordered = groups
            .OrderBy(g => g.Category == OtherLabel)
            .ThenByDescending(g => impact ? g.Impact : g.Count)
            .ThenByDescending(g => g.Count)
            .ToList();
        var total = ordered.Sum(g => impact ? g.Impact : g.Count);
        if (total <= 0) return new List<ParetoItemDto>();

        var result = new List<ParetoItemDto>();
        double cumulative = 0;
        var thresholdCrossed = false;
        foreach (var g in ordered)
        {
            var pct = (impact ? g.Impact : g.Count) / total * 100;
            cumulative += pct;
            var isVitalFew = !thresholdCrossed;
            if (cumulative >= 80.0) thresholdCrossed = true;
            result.Add(new ParetoItemDto
            {
                Category = g.Category,
                Count = g.Count,
                Impact = Math.Round(g.Impact, 1),
                Percentage = Math.Round(pct, 2),
                CumulativePercentage = Math.Round(Math.Min(cumulative, 100), 2),
                IsVitalFew = isVitalFew,
            });
        }
        return result;
    }

    public async Task<ParetoSuggestionDto> GetSuggestionAsync(ParetoSuggestRequestDto request, bool restrictSmallGroups = false)
    {
        // No default window: the whole history counts unless the caller narrows the period.
        var dateFrom = request.DateFrom;
        var dateTo = request.DateTo;
        var candidates = new List<ParetoCandidateDto>();
        var baselines = new Dictionary<ParetoDimension, List<ParetoItemDto>>();

        async Task AddAsync(ParetoRequestDto filtered, string mode, string label)
        {
            filtered.DateFrom = dateFrom;
            filtered.DateTo = dateTo;
            var raw = await GetRawAsync(filtered);
            if (!baselines.TryGetValue(filtered.Dimension, out var baseline))
            {
                // Distribution of the same dimension over the whole (period of the) history: what "normal" looks like.
                baseline = await GetRawAsync(new ParetoRequestDto { Dimension = filtered.Dimension, DateFrom = dateFrom, DateTo = dateTo });
                baselines[filtered.Dimension] = baseline;
            }
            var shown = restrictSmallGroups ? RestrictSmallGroups(raw, null) : raw;
            candidates.Add(ToCandidate(shown, raw, baseline, filtered.Dimension.ToString(), mode, label));
        }

        // Candidate A — follow the defect across lines/machines
        if (!string.IsNullOrWhiteSpace(request.DefectType))
            await AddAsync(new ParetoRequestDto { Dimension = ParetoDimension.ProductionLine, DefectType = request.DefectType },
                "byDefect", $"Où « {request.DefectType} » arrive-t-il le plus ?");

        // Candidate B — profile the machine/line (needs production line)
        if (!string.IsNullOrWhiteSpace(request.ProductionLine))
            await AddAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType, ProductionLine = request.ProductionLine },
                "byLine", $"Quels défauts sur {request.ProductionLine} ?");

        // Candidate C — client concentration for this defect (create-time useful)
        if (!string.IsNullOrWhiteSpace(request.DefectType))
            await AddAsync(new ParetoRequestDto { Dimension = ParetoDimension.ClientId, DefectType = request.DefectType },
                "byClient", $"Quels clients concentrent « {request.DefectType} » ?");

        // Candidate D — if only client is typed during form fill
        if (string.IsNullOrWhiteSpace(request.DefectType) && !string.IsNullOrWhiteSpace(request.ClientId))
            await AddAsync(new ParetoRequestDto { Dimension = ParetoDimension.DefectType, ClientId = request.ClientId },
                "byClientProfile", $"Quels défauts pour le client {request.ClientId} ?");

        // An axis with a single category is trivially "100 % concentrated": not a finding.
        var withData = candidates
            .Where(c => c.SampleSize > 0 && c.Items.Count(i => !IsUnknown(i)) >= 2)
            .ToList();
        if (withData.Count == 0)
        {
            return new ParetoSuggestionDto
            {
                HasData = false,
                InsufficientData = true,
                MinSample = MinSampleForSuggestion,
                Explanation = "Historique insuffisant pour une recommandation. L'analyse reste entièrement possible à la main : choisissez l'axe et la période vous-même."
            };
        }

        var enough = withData.Where(c => c.SampleSize >= MinSampleForSuggestion).ToList();
        if (enough.Count == 0)
        {
            var largest = withData.OrderByDescending(c => c.SampleSize).First();
            return new ParetoSuggestionDto
            {
                HasData = false,
                InsufficientData = true,
                MinSample = MinSampleForSuggestion,
                SampleSize = largest.SampleSize,
                Items = largest.Items,
                Explanation = $"Historique insuffisant : {largest.SampleSize} dossier(s) comparable(s), {MinSampleForSuggestion} minimum pour une recommandation fiable. L'analyse reste possible à la main."
            };
        }

        // Only axes that differ significantly from the usual distribution are worth recommending.
        // Axes tied within TieBand: the one built on the larger sample wins.
        var patterned = enough
            .Where(c => c.Score > 0)
            .OrderByDescending(c => Math.Round(c.Score / TieBand))
            .ThenByDescending(c => c.SampleSize)
            .ToList();
        if (patterned.Count == 0)
        {
            var largest = enough.OrderByDescending(c => c.SampleSize).First();
            return new ParetoSuggestionDto
            {
                HasData = false,
                NoPattern = true,
                MinSample = MinSampleForSuggestion,
                SampleSize = largest.SampleSize,
                Items = largest.Items,
                Explanation = "Aucune concentration statistiquement nette sur les axes comparés : la répartition ressemble à la répartition habituelle."
            };
        }

        var best = patterned[0];
        return new ParetoSuggestionDto
        {
            HasData = true,
            MinSample = MinSampleForSuggestion,
            RecommendedDimension = best.Dimension,
            RecommendedMode = best.Mode,
            RecommendedLabel = best.Label,
            TopCategory = best.TopCategory,
            TopPercentage = best.TopPercentage,
            SampleSize = best.SampleSize,
            // Effect size of the axis against the usual distribution, 0 (same) to 1 (completely different).
            ConfidenceScore = Math.Round(best.Score, 2),
            Items = best.Items,
            Candidates = patterned,
            Explanation = BuildExplanation(best, request)
        };
    }

    private static IQueryable<Core.Entities.Claim> ApplyFilters(
        IQueryable<Core.Entities.Claim> query,
        ParetoRequestDto request,
        IReadOnlyCollection<string>? defectTypeVariants = null)
    {
        if (request.DateFrom.HasValue)
            query = query.Where(c => c.DetectionDate >= request.DateFrom.Value);
        if (request.DateTo.HasValue)
            query = query.Where(c => c.DetectionDate <= request.DateTo.Value);
        if (!string.IsNullOrEmpty(request.ClientId))
            query = query.Where(c => c.ClientId == request.ClientId);
        if (!string.IsNullOrEmpty(request.ProductionLine))
            query = query.Where(c => c.ProductionLine == request.ProductionLine);
        if (!string.IsNullOrEmpty(request.DefectType))
            query = defectTypeVariants is { Count: > 0 }
                ? query.Where(c => defectTypeVariants.Contains(c.DefectType))
                : query.Where(c => c.DefectType == request.DefectType);
        return query;
    }

    private sealed class Row
    {
        public string Category { get; set; } = string.Empty;
        public string Severity { get; set; } = string.Empty;
        public int? Defective { get; set; }
    }

    private async Task<List<ParetoItemDto>> BuildParetoAsync(
        IQueryable<Core.Entities.Claim> query,
        ParetoDimension dimension,
        string? measure,
        DefectTypeResolver defectTypes)
    {
        var rows = dimension switch
        {
            ParetoDimension.DefectType => await query
                .Select(c => new Row { Category = c.DefectType, Severity = c.Severity, Defective = c.DefectiveQuantity }).ToListAsync(),
            ParetoDimension.ProductionLine => await query
                .Select(c => new Row { Category = c.ProductionLine ?? UnknownLabel, Severity = c.Severity, Defective = c.DefectiveQuantity }).ToListAsync(),
            ParetoDimension.ClientId => await query
                .Select(c => new Row { Category = c.ClientId, Severity = c.Severity, Defective = c.DefectiveQuantity }).ToListAsync(),
            ParetoDimension.Shift => await query
                .Select(c => new Row { Category = c.Shift ?? UnknownLabel, Severity = c.Severity, Defective = c.DefectiveQuantity }).ToListAsync(),
            ParetoDimension.Severity => await query
                .Select(c => new Row { Category = c.Severity, Severity = c.Severity, Defective = c.DefectiveQuantity }).ToListAsync(),
            _ => throw new ArgumentOutOfRangeException(nameof(dimension), dimension, "Dimension de Pareto non gérée")
        };

        // Old claims keep their own spelling; the statistics count every variant under the name the admin kept.
        if (dimension == ParetoDimension.DefectType)
            foreach (var row in rows) row.Category = defectTypes.Resolve(row.Category);

        // Impact = defective quantity × severity weight; a dossier without a recorded quantity counts as one unit.
        var groups = rows
            .GroupBy(r => r.Category)
            .Select(g => (Category: g.Key, Count: g.Count(), Impact: g.Sum(r => (double)Math.Max(1, r.Defective ?? 0) * SeverityWeight(r.Severity))))
            .ToList();
        return Rank(groups, measure);
    }

    private static int SeverityWeight(string? severity) => (severity ?? string.Empty).ToUpperInvariant() switch
    {
        "LOW" => 1,
        "MEDIUM" => 2,
        "HIGH" => 3,
        "CRITICAL" => 5,
        _ => 2,
    };

    private static bool IsUnknown(ParetoItemDto item) =>
        string.Equals(item.Category, UnknownLabel, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// How far the sample's distribution is from the usual (whole-history) distribution of the same axis:
    /// Cramér's V from a chi-square goodness-of-fit (0 = identical, 1 = totally different), plus a
    /// significance flag (Wilson–Hilferty normal approximation of the chi-square at the 5 % level).
    /// Comparing with the usual distribution makes axes with few or many categories comparable.
    /// </summary>
    private static (double V, bool Significant) EffectVsBaseline(List<ParetoItemDto> raw, List<ParetoItemDto> baseline)
    {
        var sample = raw.Where(i => !IsUnknown(i)).ToDictionary(i => i.Category, i => i.Count);
        var usual = baseline.Where(i => !IsUnknown(i)).ToList();
        double n = sample.Values.Sum();
        double total = usual.Sum(i => i.Count);
        if (usual.Count < MinBaselineCategories || n < 1 || total < 1) return (0, false);

        double chi2 = 0;
        foreach (var b in usual)
        {
            var expected = n * b.Count / total;
            sample.TryGetValue(b.Category, out var observed);
            chi2 += Math.Pow(observed - expected, 2) / expected;
        }

        double df = usual.Count - 1;
        var v = Math.Min(1.0, Math.Sqrt(chi2 / (n * df)));
        var z = (Math.Pow(chi2 / df, 1.0 / 3) - (1 - 2.0 / (9 * df))) / Math.Sqrt(2.0 / (9 * df));
        return (v, z > 1.645);
    }

    private static ParetoCandidateDto ToCandidate(
        List<ParetoItemDto> shown,
        List<ParetoItemDto> raw,
        List<ParetoItemDto> baseline,
        string dimension,
        string mode,
        string label)
    {
        // "Non renseigné" is missing data, never a finding: it cannot be the top of a recommendation.
        var known = shown.Where(i => !IsUnknown(i)).ToList();
        var sampleSize = raw.Where(i => !IsUnknown(i)).Sum(i => i.Count);
        var top = known.FirstOrDefault();
        var (v, significant) = EffectVsBaseline(raw, baseline);

        return new ParetoCandidateDto
        {
            Dimension = dimension,
            Mode = mode,
            Label = label,
            TopCategory = top?.Category,
            TopPercentage = top?.Percentage ?? 0,
            SampleSize = sampleSize,
            Score = significant ? v : 0,
            Items = shown
        };
    }

    private static string BuildExplanation(ParetoCandidateDto best, ParetoSuggestRequestDto request)
    {
        var top = best.TopCategory ?? "N/A";
        var pct = best.TopPercentage.ToString("0.#");
        var effect = $" Écart à la répartition habituelle : {best.Score:0.00} (0 = aucun, 1 = total).";
        return best.Mode switch
        {
            "byDefect" =>
                $"Pour « {request.DefectType} », {pct}% des occurrences se concentrent sur {top} (n={best.SampleSize}). Axe recommandé : suivre le défaut.{effect}",
            "byLine" =>
                $"Sur {request.ProductionLine}, {pct}% des défauts sont « {top} » (n={best.SampleSize}). Axe recommandé : profiler la machine.{effect}",
            "byClient" =>
                $"Pour « {request.DefectType} », le client {top} concentre {pct}% des cas (n={best.SampleSize}).{effect}",
            _ =>
                $"Axe le plus marqué : {best.Label}. Tête de Pareto = {top} ({pct}%, n={best.SampleSize}).{effect}"
        };
    }
}
