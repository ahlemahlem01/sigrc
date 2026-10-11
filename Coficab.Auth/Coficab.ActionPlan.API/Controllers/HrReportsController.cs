using System.Text;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.DTOs.HrReports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Authorize(Policy = "AdminOnly")]
[Route("api/hr-reports")]
public class HrReportsController : ControllerBase
{
    private readonly IGeminiService _gemini;

    public HrReportsController(IGeminiService gemini)
    {
        _gemini = gemini;
    }

    /// <summary>
    /// Génère une synthèse opérationnelle en langage naturel (Gemini) à partir des données collaborateurs.
    /// </summary>
    [HttpPost("generate")]
    public async Task<IActionResult> Generate(
        [FromBody] GenerateHrReportRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Employees == null || request.Employees.Count == 0)
            return BadRequest(new { message = "Aucun collaborateur sélectionné pour le rapport." });

        if (request.Employees.Count > 80)
            return BadRequest(new { message = "Limite de 80 collaborateurs par rapport." });

        var prompt = BuildPrompt(request);

        try
        {
            var summary = await _gemini.GenerateTextAsync(
                prompt,
                temperature: 0.35,
                maxOutputTokens: 4096,
                cancellationToken: cancellationToken);

            if (string.IsNullOrWhiteSpace(summary))
                return StatusCode(502, new { message = "La synthèse IA est vide." });

            return Ok(new GenerateHrReportResponse
            {
                Summary = summary.Trim(),
                GeneratedAt = DateTime.UtcNow,
                EmployeeCount = request.Employees.Count,
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(502, new { message = ex.Message });
        }
    }

    private static string BuildPrompt(GenerateHrReportRequest request)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Tu es un analyste opérationnel chez COFICAB (Qualité, Production, Maintenance, Logistics, Safety).");
        sb.AppendLine("À partir des indicateurs agrégés ci-dessous, rédige une synthèse managériale en français destinée aux responsables d'équipes terrain et process.");
        sb.AppendLine();
        sb.AppendLine("Structure attendue (texte continu, paragraphes clairs, sans markdown, sans listes à puces, sans emojis) :");
        sb.AppendLine("1) Tendances globales sur la période (activité, charge dossiers, clôture, retards).");
        sb.AppendLine("2) Points d'attention (surcharge, inactivité, retards, compétences outils qualité faibles).");
        sb.AppendLine("3) Recommandations concrètes pour les managers Qualité / Production / Maintenance / process.");
        sb.AppendLine();
        sb.AppendLine("Règles de sortie : uniquement le texte final, prêt à être collé dans un rapport PDF opérationnel.");
        sb.AppendLine("Ne parle pas de RH, recrutement ou paie : le contexte est la performance opérationnelle et qualité.");
        sb.AppendLine();

        var start = request.PeriodStart?.ToString("yyyy-MM-dd") ?? "non précisée";
        var end = request.PeriodEnd?.ToString("yyyy-MM-dd") ?? "non précisée";
        sb.AppendLine($"Période : {start} → {end}");
        if (!string.IsNullOrWhiteSpace(request.Department))
            sb.AppendLine($"Filtre département : {request.Department}");
        sb.AppendLine($"Nombre de collaborateurs : {request.Employees.Count}");
        sb.AppendLine();

        var inactive = request.Employees.Count(e =>
            string.Equals(e.ActivityStatus, "Inactive", StringComparison.OrdinalIgnoreCase));
        var low = request.Employees.Count(e =>
            string.Equals(e.ActivityStatus, "LowActivity", StringComparison.OrdinalIgnoreCase));
        var overloaded = request.Employees.Count(e => e.RemainingCapacity <= 0 ||
            string.Equals(e.Workload, "high", StringComparison.OrdinalIgnoreCase));
        var avgClosure = request.Employees.Count == 0
            ? 0
            : (int)Math.Round(request.Employees.Average(e => e.ClosureRate));
        var totalOverdue = request.Employees.Sum(e => e.OverdueCount);

        sb.AppendLine("Agrégats :");
        sb.AppendLine($"- Inactifs : {inactive} · Peu actifs : {low}");
        sb.AppendLine($"- En surcharge / charge élevée : {overloaded}");
        sb.AppendLine($"- Taux de clôture moyen : {avgClosure}%");
        sb.AppendLine($"- Total dossiers en retard : {totalOverdue}");
        sb.AppendLine();
        sb.AppendLine("Détail par collaborateur :");

        foreach (var e in request.Employees)
        {
            var levels = e.CompetencyLevels.Count == 0
                ? "n/a"
                : string.Join(", ", e.CompetencyLevels.Select(kv => $"{kv.Key}={kv.Value}"));
            var badges = e.Badges.Count == 0 ? "aucun" : string.Join(", ", e.Badges.Take(6));
            var timeline = e.TimelineHighlights.Count == 0
                ? "aucun"
                : string.Join(" | ", e.TimelineHighlights.Take(4));

            sb.AppendLine(
                $"- {e.FullName} ({(string.IsNullOrWhiteSpace(e.Department) ? "—" : e.Department)}) · rôle {(string.IsNullOrWhiteSpace(e.Role) ? "—" : e.Role)} · activité {e.ActivityStatus} · " +
                $"dossiers actifs {e.ActiveDossiers} · capacité restante {e.RemainingCapacity} · " +
                $"clôture {e.ClosureRate}% · retards {e.OverdueCount} · délai moyen {e.AvgDelayDays} j · " +
                $"charge {e.Workload} · actions 60j {e.RecentActionCount} · compétences [{levels}] · " +
                $"badges [{badges}] · historique [{timeline}]");
        }

        return sb.ToString();
    }
}
