using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

public record AlertAiAnalysis(string Problem, string ProbableCause, string Consequences);

public interface IAlertAnalysisService
{
    /// <summary>
    /// Génère et persiste la mini-analyse Gemini pour une alerte (à la création).
    /// Ne fait rien si déjà analysée, sauf si <paramref name="force"/> est vrai.
    /// </summary>
    Task<bool> GenerateAndPersistAsync(Guid alertId, bool force = false, CancellationToken cancellationToken = default);
}

public class AlertAnalysisService : IAlertAnalysisService
{
    private readonly IApplicationDbContext _db;
    private readonly IGeminiService _gemini;
    private readonly ILogger<AlertAnalysisService> _logger;

    public AlertAnalysisService(
        IApplicationDbContext db,
        IGeminiService gemini,
        ILogger<AlertAnalysisService> logger)
    {
        _db = db;
        _gemini = gemini;
        _logger = logger;
    }

    public async Task<bool> GenerateAndPersistAsync(
        Guid alertId,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId, cancellationToken);
        if (alert == null)
            return false;

        if (!force && !string.IsNullOrWhiteSpace(alert.AiProblem) && alert.AiAnalyzedAt.HasValue)
            return false;

        AlertAiAnalysis analysis;
        try
        {
            var context = await BuildRecentContextAsync(alert, cancellationToken);
            analysis = await CallGeminiAsync(alert, context, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Gemini analysis failed for alert {AlertId}; using fallback", alertId);
            analysis = BuildFallback(alert);
        }

        alert.AiProblem = Truncate(analysis.Problem, 1000);
        alert.AiProbableCause = Truncate(analysis.ProbableCause, 1500);
        alert.AiConsequences = Truncate(analysis.Consequences, 1500);
        alert.AiAnalyzedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<string> BuildRecentContextAsync(Alert alert, CancellationToken ct)
    {
        var since = DateTime.UtcNow.AddDays(-28);
        var defect = alert.DefectType?.Trim() ?? string.Empty;
        var line = alert.ProductionLine?.Trim() ?? string.Empty;

        var recent = await _db.Claims
            .AsNoTracking()
            .Where(c => !c.IsArchived && c.CreatedAt >= since)
            .Where(c => c.DefectType != null && c.DefectType.ToLower() == defect.ToLower())
            .Where(c => string.IsNullOrEmpty(line)
                        || (c.ProductionLine != null && c.ProductionLine.ToLower() == line.ToLower()))
            .OrderByDescending(c => c.CreatedAt)
            .Take(8)
            .Select(c => new
            {
                c.Title,
                c.Severity,
                c.StatusCode,
                c.ProductionLine,
                c.CreatedAt,
            })
            .ToListAsync(ct);

        if (recent.Count == 0)
            return "Aucun historique récent de réclamations pour ce couple défaut/ligne.";

        var sb = new StringBuilder();
        sb.AppendLine($"Historique récent ({recent.Count} dossiers, 28 derniers jours) :");
        foreach (var c in recent)
        {
            sb.AppendLine(
                $"- {c.CreatedAt:yyyy-MM-dd} | {c.Title} | sévérité={c.Severity ?? "n/a"} | statut={c.StatusCode} | ligne={c.ProductionLine ?? "n/a"}");
        }
        return sb.ToString();
    }

    private async Task<AlertAiAnalysis> CallGeminiAsync(Alert alert, string context, CancellationToken ct)
    {
        var prompt = $@"Tu es un analyste qualité automobile (COFICAB / IATF). 
À partir de l'anomalie ci-dessous, génère une mini-analyse pour un employé non technique.

Contexte alerte :
- Type de défaut : {alert.DefectType}
- Ligne de production : {alert.ProductionLine}
- Volume cette semaine : {alert.CurrentCount}
- Moyenne habituelle (4 semaines) : {alert.BaselineMean}
- Indicateur technique z-score : {alert.ZScore:F2}

{context}

Réponds UNIQUEMENT avec un JSON compact valide, sans markdown, sans backticks, sans emojis, clés exactes :
{{""probleme"":""..."",""causeProbable"":""..."",""consequences"":""...""}}

Règles de contenu (français) :
- probleme : une seule phrase claire qui reformule l'anomalie (défaut, ligne, ampleur).
- causeProbable : une hypothèse plausible présentée comme une piste à vérifier, pas une certitude (utilise des formulations du type ""il est possible que"", ""à vérifier"").
- consequences : 2 à 3 phrases sur l'impact si rien n'est fait (réclamation client, coût de non-qualité, retard livraison, etc.).
- Pas de jargon statistique (ne pas mentionner z-score). Pas de TEST/DEBUG.";

        var raw = await _gemini.GenerateTextAsync(
            prompt,
            temperature: 0.35,
            maxOutputTokens: 1024,
            cancellationToken: ct);

        return ParseOrFallback(raw, alert);
    }

    private static AlertAiAnalysis ParseOrFallback(string raw, Alert alert)
    {
        var json = ExtractJsonObject(raw);
        if (json != null)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                var problem = GetProp(root, "probleme", "problem", "Probleme");
                var cause = GetProp(root, "causeProbable", "cause_probable", "CauseProbable");
                var consequences = GetProp(root, "consequences", "Consequences");

                if (!string.IsNullOrWhiteSpace(problem)
                    && !string.IsNullOrWhiteSpace(cause)
                    && !string.IsNullOrWhiteSpace(consequences))
                {
                    return new AlertAiAnalysis(
                        Clean(problem),
                        Clean(cause),
                        Clean(consequences));
                }
            }
            catch
            {
                // fall through
            }
        }

        return BuildFallback(alert);
    }

    private static string? ExtractJsonObject(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var text = raw.Trim();
        text = Regex.Replace(text, @"^```(?:json)?\s*", "", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"\s*```$", "");
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return null;
        return text[start..(end + 1)];
    }

    private static string? GetProp(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (root.TryGetProperty(name, out var el))
            {
                var s = el.GetString();
                if (!string.IsNullOrWhiteSpace(s)) return s;
            }
        }
        return null;
    }

    private static AlertAiAnalysis BuildFallback(Alert alert)
    {
        var defect = string.IsNullOrWhiteSpace(alert.DefectType) ? "ce défaut" : alert.DefectType.Trim();
        var line = string.IsNullOrWhiteSpace(alert.ProductionLine) ? "cette ligne" : alert.ProductionLine.Trim();
        var current = alert.CurrentCount;
        var mean = alert.BaselineMean;

        return new AlertAiAnalysis(
            $"Hausse inhabituelle : {current} réclamation(s) « {defect} » sur {line} cette semaine, contre environ {mean:0.#} en moyenne.",
            $"Il est possible qu'un écart process ou matière sur {line} favorise le défaut « {defect} ». Cette piste doit être vérifiée sur le terrain (paramètres machine, outillage, lot matière).",
            $"Si la tendance continue, le risque de réclamation client augmente, avec un coût de non-qualité (retravail, rebut) et des retards possibles de livraison. Une action rapide limite l'impact.");
    }

    private static string Clean(string text)
    {
        var t = text.Trim();
        t = Regex.Replace(t, @"^\s*TEST(?:\s+\S+)?\s*[—–:-]\s*", "", RegexOptions.IgnoreCase);
        t = t.Replace("**", "").Replace("__", "").Trim();
        return t;
    }

    private static string Truncate(string value, int max)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= max) return value;
        return value[..(max - 1)].TrimEnd() + "…";
    }
}
