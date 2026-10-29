using Coficab.ActionPlan.Application.Dashboard;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Coficab.ActionPlan.Application.Services;

public record QualityAssistantMessageDto(string Role, string Content);

public record QualityAssistantChatResult(string Reply);

public interface IQualityAssistantService
{
    Task<QualityAssistantChatResult> ChatAsync(
        string userId,
        bool isAdmin,
        string message,
        IReadOnlyList<QualityAssistantMessageDto>? history,
        string? language = null,
        CancellationToken cancellationToken = default);
}

public class QualityAssistantService : IQualityAssistantService
{
    private const int MaxToolRounds = 4;
    private const int MaxHistoryTurns = 12;

    private readonly IApplicationDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<QualityAssistantService> _logger;

    public QualityAssistantService(
        IApplicationDbContext db,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<QualityAssistantService> logger)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<QualityAssistantChatResult> ChatAsync(
        string userId,
        bool isAdmin,
        string message,
        IReadOnlyList<QualityAssistantMessageDto>? history,
        string? language = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(message))
            throw new ArgumentException("Le message est requis.", nameof(message));

        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-3.6-flash";
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("La clé d'API Gemini n'est pas configurée.");

        var systemInstruction = BuildSystemInstruction(isAdmin, language);
        var contents = BuildInitialContents(history, message.Trim());
        var tools = BuildToolsPayload();

        var httpClient = _httpClientFactory.CreateClient();
        var endpoint =
            $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        for (var round = 0; round < MaxToolRounds; round++)
        {
            var payload = new Dictionary<string, object?>
            {
                ["system_instruction"] = new
                {
                    parts = new[] { new { text = systemInstruction } }
                },
                ["contents"] = contents,
                ["tools"] = tools,
                ["toolConfig"] = new
                {
                    functionCallingConfig = new { mode = "AUTO" }
                },
                ["generationConfig"] = new
                {
                    temperature = 0.25,
                    maxOutputTokens = 2048,
                    thinkingConfig = new { thinkingLevel = "low" }
                }
            };

            HttpResponseMessage response;
            try
            {
                response = await httpClient.PostAsJsonAsync(endpoint, payload, cancellationToken);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "Impossible de joindre Gemini (Quality Assistant)");
                throw new InvalidOperationException($"Impossible de contacter le service IA : {ex.Message}", ex);
            }

            var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini Quality Assistant HTTP {Status}: {Body}",
                    (int)response.StatusCode, Truncate(responseJson, 800));
                throw new InvalidOperationException($"Erreur lors de la génération IA ({(int)response.StatusCode}).");
            }

            using var doc = JsonDocument.Parse(responseJson);
            var root = doc.RootElement;

            if (!root.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            {
                var blockReason = root.TryGetProperty("promptFeedback", out var feedback) &&
                                  feedback.TryGetProperty("blockReason", out var reason)
                    ? reason.GetString()
                    : null;
                throw new InvalidOperationException(
                    blockReason != null
                        ? $"La génération IA a été bloquée ({blockReason})."
                        : "La génération IA n'a retourné aucun résultat exploitable.");
            }

            var first = candidates[0];
            if (!first.TryGetProperty("content", out var contentEl))
                throw new InvalidOperationException("Réponse IA dans un format inattendu.");

            var modelParts = ExtractParts(contentEl);
            var functionCalls = modelParts
                .Where(p => p.TryGetProperty("functionCall", out _))
                .ToList();

            // Echo model turn (required before function responses)
            contents.Add(new Dictionary<string, object?>
            {
                ["role"] = "model",
                ["parts"] = ClonePartsForRequest(modelParts)
            });

            if (functionCalls.Count == 0)
            {
                var text = ExtractText(modelParts);
                if (string.IsNullOrWhiteSpace(text))
                    throw new InvalidOperationException("La réponse IA est vide.");
                return new QualityAssistantChatResult(CleanReply(text));
            }

            var functionResponseParts = new List<object>();
            foreach (var part in functionCalls)
            {
                var fc = part.GetProperty("functionCall");
                var name = fc.GetProperty("name").GetString() ?? string.Empty;
                var args = fc.TryGetProperty("args", out var a) ? a : default;

                object toolResult;
                try
                {
                    toolResult = await ExecuteToolAsync(name, args, userId, isAdmin, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Tool {Tool} failed", name);
                    toolResult = new { error = ex.Message };
                }

                functionResponseParts.Add(new
                {
                    functionResponse = new
                    {
                        name,
                        response = toolResult
                    }
                });
            }

            contents.Add(new Dictionary<string, object?>
            {
                ["role"] = "user",
                ["parts"] = functionResponseParts
            });
        }

        throw new InvalidOperationException("La conversation IA a dépassé le nombre maximal d'appels d'outils.");
    }

    private static string BuildSystemInstruction(bool isAdmin, string? language)
    {
        var lang = NormalizeLanguage(language);
        var (replyLang, refuseOther) = lang switch
        {
            "en" => (
                "Reply in English, clearly and concisely, without markdown, without decorative bullet lists, without emoji.",
                "Politely refuse any request about another employee."
            ),
            "it" => (
                "Rispondi in italiano, in modo chiaro e conciso, senza markdown, senza elenchi puntati decorativi, senza emoji.",
                "Rifiuta gentilmente ogni richiesta relativa a un altro dipendente."
            ),
            _ => (
                "Réponds en français, de façon claire et concise, sans markdown, sans listes à puces décoratives, sans emoji.",
                "Refuse poliment toute demande concernant un autre employé."
            ),
        };

        var sb = new StringBuilder();
        sb.AppendLine("Tu es l'Assistant Qualité COFICAB. Tu aides les utilisateurs à comprendre claims, CAPA et indicateurs qualité.");
        sb.AppendLine(replyLang);
        sb.AppendLine("Utilise les fonctions disponibles pour obtenir des données réelles avant de répondre aux questions factuelles.");
        sb.AppendLine("Ne invente jamais de chiffres : base-toi uniquement sur les résultats des fonctions.");
        if (isAdmin)
        {
            sb.AppendLine("Contexte : utilisateur Admin / SuperAdmin. Les fonctions renvoient les données de toute l'organisation.");
        }
        else
        {
            sb.AppendLine($"Contexte : utilisateur Employé. Les fonctions ne renvoient QUE ses dossiers et sa performance personnelle. {refuseOther}");
        }
        sb.AppendLine("Si aucune donnée n'est trouvée, dis-le clairement.");
        return sb.ToString();
    }

    private static string NormalizeLanguage(string? language)
    {
        if (string.IsNullOrWhiteSpace(language)) return "fr";
        var code = language.Trim().ToLowerInvariant();
        if (code.StartsWith("en")) return "en";
        if (code.StartsWith("it")) return "it";
        return "fr";
    }

    private static List<Dictionary<string, object?>> BuildInitialContents(
        IReadOnlyList<QualityAssistantMessageDto>? history,
        string message)
    {
        var contents = new List<Dictionary<string, object?>>();

        if (history is { Count: > 0 })
        {
            foreach (var item in history.TakeLast(MaxHistoryTurns))
            {
                if (string.IsNullOrWhiteSpace(item.Content)) continue;
                var role = string.Equals(item.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(item.Role, "model", StringComparison.OrdinalIgnoreCase)
                    ? "model"
                    : "user";
                contents.Add(new Dictionary<string, object?>
                {
                    ["role"] = role,
                    ["parts"] = new[] { new { text = item.Content.Trim() } }
                });
            }
        }

        contents.Add(new Dictionary<string, object?>
        {
            ["role"] = "user",
            ["parts"] = new[] { new { text = message } }
        });

        return contents;
    }

    private static object[] BuildToolsPayload()
    {
        return new object[]
        {
            new
            {
                functionDeclarations = new object[]
                {
                    new
                    {
                        name = "get_claims",
                        description =
                            "Récupère les réclamations (claims) filtrées par client, statut et période. Pour un employé : uniquement ses claims assignés ou créés.",
                        parameters = new
                        {
                            type = "OBJECT",
                            properties = new Dictionary<string, object>
                            {
                                ["clientId"] = new
                                {
                                    type = "STRING",
                                    description = "Identifiant ou fragment du client (optionnel)."
                                },
                                ["status"] = new
                                {
                                    type = "STRING",
                                    description = "Code statut (ex: OPEN, EN_COURS, CLOTUREE, DRAFT). Optionnel."
                                },
                                ["periodDays"] = new
                                {
                                    type = "INTEGER",
                                    description = "Nombre de jours en arrière à partir d'aujourd'hui. Optionnel."
                                }
                            }
                        }
                    },
                    new
                    {
                        name = "get_capa",
                        description =
                            "Récupère les plans d'actions / CAPA filtrés par statut et retard. Pour un employé : uniquement ses plans assignés ou dont il est propriétaire.",
                        parameters = new
                        {
                            type = "OBJECT",
                            properties = new Dictionary<string, object>
                            {
                                ["status"] = new
                                {
                                    type = "STRING",
                                    description = "Statut : Created, Ongoing, Closed, Archived (ou équivalent FR). Optionnel."
                                },
                                ["overdueOnly"] = new
                                {
                                    type = "BOOLEAN",
                                    description = "Si true, ne retourne que les CAPA en retard."
                                }
                            }
                        }
                    },
                    new
                    {
                        name = "get_performance_metrics",
                        description =
                            "Récupère les métriques de performance (taux de clôture, retards, charge). Employé = soi-même uniquement. Admin = agrégat org ou un employé ciblé.",
                        parameters = new
                        {
                            type = "OBJECT",
                            properties = new Dictionary<string, object>
                            {
                                ["employeeId"] = new
                                {
                                    type = "STRING",
                                    description = "Id utilisateur cible (admin uniquement). Ignoré pour un employé."
                                },
                                ["periodDays"] = new
                                {
                                    type = "INTEGER",
                                    description = "Fenêtre en jours pour le calcul (défaut 90)."
                                }
                            }
                        }
                    },
                    new
                    {
                        name = "get_global_indicators",
                        description =
                            "Récupère les indicateurs globaux qualité (dossiers ouverts, retards, taux de clôture, alertes critiques). Employé = indicateurs personnels. Admin = vue organisation.",
                        parameters = new
                        {
                            type = "OBJECT",
                            properties = new Dictionary<string, object>
                            {
                                ["periodDays"] = new
                                {
                                    type = "INTEGER",
                                    description = "Fenêtre en jours (optionnel, défaut 90)."
                                }
                            }
                        }
                    }
                }
            }
        };
    }

    private async Task<object> ExecuteToolAsync(
        string name,
        JsonElement args,
        string userId,
        bool isAdmin,
        CancellationToken ct)
    {
        return name switch
        {
            "get_claims" => await GetClaimsAsync(args, userId, isAdmin, ct),
            "get_capa" => await GetCapaAsync(args, userId, isAdmin, ct),
            "get_performance_metrics" => await GetPerformanceMetricsAsync(args, userId, isAdmin, ct),
            "get_global_indicators" => await GetGlobalIndicatorsAsync(args, userId, isAdmin, ct),
            _ => new { error = $"Fonction inconnue : {name}" }
        };
    }

    private async Task<object> GetClaimsAsync(JsonElement args, string userId, bool isAdmin, CancellationToken ct)
    {
        var clientId = GetString(args, "clientId");
        var status = GetString(args, "status");
        var periodDays = GetInt(args, "periodDays");

        var query = _db.Claims.AsNoTracking().Where(c => !c.IsArchived);

        if (!isAdmin)
        {
            var uid = userId.Trim().ToLowerInvariant();
            query = query.Where(c =>
                (c.AssignedToId != null && c.AssignedToId.ToLower() == uid)
                || (c.CreatedById != null && c.CreatedById.ToLower() == uid));
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            var client = clientId.Trim().ToLowerInvariant();
            query = query.Where(c => c.ClientId.ToLower().Contains(client));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var st = status.Trim().ToUpperInvariant();
            query = query.Where(c => c.StatusCode.ToUpper() == st);
        }

        if (periodDays is > 0)
        {
            var since = DateTime.UtcNow.AddDays(-periodDays.Value);
            query = query.Where(c => c.CreatedAt >= since || c.DetectionDate >= since);
        }

        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .Take(40)
            .Select(c => new
            {
                id = c.Id,
                title = c.Title,
                clientId = c.ClientId,
                status = c.StatusCode,
                severity = c.Severity,
                assignedToId = c.AssignedToId,
                assignedToName = c.AssignedToName,
                detectionDate = c.DetectionDate,
                deadline = c.Deadline,
                createdAt = c.CreatedAt,
            })
            .ToListAsync(ct);

        return new
        {
            scope = isAdmin ? "organization" : "employee",
            count = items.Count,
            claims = items,
        };
    }

    private async Task<object> GetCapaAsync(JsonElement args, string userId, bool isAdmin, CancellationToken ct)
    {
        var status = GetString(args, "status");
        var overdueOnly = GetBool(args, "overdueOnly") ?? false;
        var today = DateTime.UtcNow.Date;

        var query = _db.ActionPlans
            .AsNoTracking()
            .Include(p => p.PlanActions)
            .Include(p => p.Department)
            .Where(p => !p.IsArchived);

        if (!isAdmin)
        {
            var uid = userId.Trim().ToLowerInvariant();
            query = query.Where(p =>
                (p.AssignedToId != null && p.AssignedToId.ToLower() == uid)
                || (p.OwnerId != null && p.OwnerId.ToLower() == uid)
                || p.UserAssignments.Any(a => a.UserId.ToLower() == uid));
        }

        var plans = await query.OrderByDescending(p => p.CreatedAt).Take(80).ToListAsync(ct);

        if (!string.IsNullOrWhiteSpace(status))
        {
            var wanted = ParseActionPlanStatus(status);
            if (wanted.HasValue)
                plans = plans.Where(p => p.Status == wanted.Value).ToList();
        }

        static int OverdueDays(Core.Entities.ActionPlan plan, DateTime today)
        {
            if (plan.Status is ActionPlanStatus.Closed or ActionPlanStatus.Archived)
                return 0;

            if (plan.Deadline.HasValue)
            {
                var lag = (today - plan.Deadline.Value.Date).Days;
                if (lag > 0) return lag;
            }

            var actions = plan.PlanActions?.Where(a => !a.IsArchived).ToList();
            if (actions is not { Count: > 0 }) return 0;

            var maxLag = 0;
            foreach (var a in actions)
            {
                if (a.Progress is ActionProgress.Hundred or ActionProgress.Validated or ActionProgress.Cancelled)
                    continue;
                if (!a.Deadline.HasValue) continue;
                var lag = (today - a.Deadline.Value.Date).Days;
                if (lag > maxLag) maxLag = lag;
            }
            return maxLag;
        }

        var projected = plans
            .Select(p => new
            {
                id = p.Id,
                title = p.Title,
                status = p.Status.ToString(),
                type = p.Type.ToString(),
                assignedToId = p.AssignedToId,
                ownerId = p.OwnerId,
                deadline = p.Deadline,
                progress = p.Progress,
                department = p.Department?.Name,
                overdueDays = OverdueDays(p, today),
            })
            .ToList();

        if (overdueOnly)
            projected = projected.Where(p => p.overdueDays > 0).ToList();

        projected = projected.Take(40).ToList();

        return new
        {
            scope = isAdmin ? "organization" : "employee",
            count = projected.Count,
            overdueCount = projected.Count(p => p.overdueDays > 0),
            capa = projected,
        };
    }

    private async Task<object> GetPerformanceMetricsAsync(
        JsonElement args,
        string userId,
        bool isAdmin,
        CancellationToken ct)
    {
        var periodDays = GetInt(args, "periodDays") ?? 90;
        var targetEmployeeId = GetString(args, "employeeId");

        string subjectId;
        if (isAdmin && !string.IsNullOrWhiteSpace(targetEmployeeId))
            subjectId = targetEmployeeId.Trim();
        else
            subjectId = userId;

        // Employé : jamais les données d'un autre
        if (!isAdmin)
            subjectId = userId;

        var uid = subjectId.Trim().ToLowerInvariant();
        var since = DateTime.UtcNow.AddDays(-Math.Clamp(periodDays, 7, 365));
        var today = DateTime.UtcNow.Date;

        var claims = await _db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived
                        && c.AssignedToId != null
                        && c.AssignedToId.ToLower() == uid
                        && (c.CreatedAt >= since || c.DetectionDate >= since))
            .Select(c => new { c.StatusCode, c.DetectionDate, c.CreatedAt, c.Deadline, c.CompletedAt, c.IsOnTime })
            .ToListAsync(ct);

        var plans = await _db.ActionPlans.AsNoTracking()
            .Where(p => !p.IsArchived
                        && (
                            (p.AssignedToId != null && p.AssignedToId.ToLower() == uid)
                            || (p.OwnerId != null && p.OwnerId.ToLower() == uid)
                        )
                        && p.CreatedAt >= since)
            .Select(p => new { p.Status, p.Deadline, p.CompletedAt, p.IsOnTime, p.Progress })
            .ToListAsync(ct);

        static bool IsClosed(string status) =>
            string.Equals(status, "CLOTUREE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "CLOSED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "CLOTURE", StringComparison.OrdinalIgnoreCase);

        var openClaims = claims.Count(c => !IsClosed(c.StatusCode));
        var closedClaims = claims.Count(c => IsClosed(c.StatusCode));
        var claimDenom = openClaims + closedClaims;
        var claimClosureRate = claimDenom == 0 ? 0 : Math.Round(100.0 * closedClaims / claimDenom, 1);

        var openPlans = plans.Count(p => p.Status is ActionPlanStatus.Created or ActionPlanStatus.Ongoing);
        var closedPlans = plans.Count(p => p.Status == ActionPlanStatus.Closed);
        var planDenom = openPlans + closedPlans;
        var planClosureRate = planDenom == 0 ? 0 : Math.Round(100.0 * closedPlans / planDenom, 1);

        var overdueClaims = claims.Count(c =>
            !IsClosed(c.StatusCode) && ClaimDeadlines.IsLate(c.Deadline, today));

        var overduePlans = plans.Count(p =>
            p.Status is ActionPlanStatus.Created or ActionPlanStatus.Ongoing
            && p.Deadline.HasValue
            && p.Deadline.Value.Date < today);

        var onTimeClosed = claims.Count(c => IsClosed(c.StatusCode) && c.IsOnTime == true)
                           + plans.Count(p => p.Status == ActionPlanStatus.Closed && p.IsOnTime == true);
        var closedWithSla = claims.Count(c => IsClosed(c.StatusCode) && c.IsOnTime != null)
                            + plans.Count(p => p.Status == ActionPlanStatus.Closed && p.IsOnTime != null);
        var onTimeRate = closedWithSla == 0 ? 0 : Math.Round(100.0 * onTimeClosed / closedWithSla, 1);

        string? displayName = null;
        var profile = await _db.UserProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId.ToLower() == uid, ct);
        if (profile != null)
            displayName = string.IsNullOrWhiteSpace(profile.Name) ? profile.Email : profile.Name;

        return new
        {
            scope = isAdmin && !string.Equals(subjectId, userId, StringComparison.OrdinalIgnoreCase)
                ? "targeted_employee"
                : (isAdmin ? "self_or_admin" : "employee"),
            employeeId = subjectId,
            employeeName = displayName,
            periodDays,
            claims = new
            {
                open = openClaims,
                closed = closedClaims,
                closureRatePercent = claimClosureRate,
                overdue = overdueClaims,
            },
            capa = new
            {
                open = openPlans,
                closed = closedPlans,
                closureRatePercent = planClosureRate,
                overdue = overduePlans,
            },
            onTimeRatePercent = onTimeRate,
            activeDossiers = openClaims + openPlans,
        };
    }

    private async Task<object> GetGlobalIndicatorsAsync(
        JsonElement args,
        string userId,
        bool isAdmin,
        CancellationToken ct)
    {
        var periodDays = GetInt(args, "periodDays") ?? 90;
        var since = DateTime.UtcNow.AddDays(-Math.Clamp(periodDays, 7, 365));
        var today = DateTime.UtcNow.Date;
        var uid = userId.Trim().ToLowerInvariant();

        var claimsQuery = _db.Claims.AsNoTracking().Where(c => !c.IsArchived);
        var plansQuery = _db.ActionPlans.AsNoTracking().Where(p => !p.IsArchived);

        if (!isAdmin)
        {
            claimsQuery = claimsQuery.Where(c =>
                (c.AssignedToId != null && c.AssignedToId.ToLower() == uid)
                || (c.CreatedById != null && c.CreatedById.ToLower() == uid));
            plansQuery = plansQuery.Where(p =>
                (p.AssignedToId != null && p.AssignedToId.ToLower() == uid)
                || (p.OwnerId != null && p.OwnerId.ToLower() == uid)
                || p.UserAssignments.Any(a => a.UserId.ToLower() == uid));
        }

        var claims = await claimsQuery
            .Where(c => c.CreatedAt >= since || c.DetectionDate >= since)
            .Select(c => new { c.StatusCode, c.Severity, c.DetectionDate, c.Deadline, c.CreatedAt })
            .ToListAsync(ct);

        var plans = await plansQuery
            .Where(p => p.CreatedAt >= since)
            .Select(p => new { p.Status, p.Deadline })
            .ToListAsync(ct);

        static bool IsClosed(string status) =>
            string.Equals(status, "CLOTUREE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "CLOSED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "CLOTURE", StringComparison.OrdinalIgnoreCase);

        static bool IsDraft(string status) =>
            string.Equals(status, "DRAFT", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "BROUILLON", StringComparison.OrdinalIgnoreCase);

        static bool IsCritical(string severity) =>
            string.Equals(severity, "CRITICAL", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "CRITIQUE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "HIGH", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "ELEVEE", StringComparison.OrdinalIgnoreCase)
            || string.Equals(severity, "ÉLEVÉE", StringComparison.OrdinalIgnoreCase);

        var openClaims = claims.Where(c => !IsClosed(c.StatusCode) && !IsDraft(c.StatusCode)).ToList();
        var closedClaims = claims.Count(c => IsClosed(c.StatusCode));
        var lateClaims = openClaims.Count(c => ClaimDeadlines.IsLate(c.Deadline, today));

        var openPlans = plans.Count(p => p.Status is ActionPlanStatus.Created or ActionPlanStatus.Ongoing);
        var closedPlans = plans.Count(p => p.Status == ActionPlanStatus.Closed);
        var latePlans = plans.Count(p =>
            p.Status is ActionPlanStatus.Created or ActionPlanStatus.Ongoing
            && p.Deadline.HasValue
            && p.Deadline.Value.Date < today);

        var claimDenom = openClaims.Count + closedClaims;
        var planDenom = openPlans + closedPlans;
        var totalOpen = openClaims.Count + openPlans;
        var totalClosed = closedClaims + closedPlans;
        var totalDenom = totalOpen + totalClosed;
        var globalClosure = totalDenom == 0 ? 0 : Math.Round(100.0 * totalClosed / totalDenom, 1);

        var criticalOpen = openClaims.Count(c => IsCritical(c.Severity));

        int? criticalAlerts = null;
        if (isAdmin)
        {
            criticalAlerts = await _db.Alerts.AsNoTracking()
                .CountAsync(a =>
                    a.Status == "pending_validation" || a.Status == "validated", ct);
        }

        return new
        {
            scope = isAdmin ? "organization" : "employee",
            periodDays,
            totalActiveDossiers = totalOpen,
            totalOverdue = lateClaims + latePlans,
            globalClosureRatePercent = globalClosure,
            claims = new
            {
                open = openClaims.Count,
                closed = closedClaims,
                overdue = lateClaims,
                criticalOpen,
                closureRatePercent = claimDenom == 0 ? 0 : Math.Round(100.0 * closedClaims / claimDenom, 1),
            },
            capa = new
            {
                open = openPlans,
                closed = closedPlans,
                overdue = latePlans,
                closureRatePercent = planDenom == 0 ? 0 : Math.Round(100.0 * closedPlans / planDenom, 1),
            },
            criticalAlerts,
        };
    }

    private static ActionPlanStatus? ParseActionPlanStatus(string raw)
    {
        var s = raw.Trim().ToLowerInvariant();
        return s switch
        {
            "created" or "cree" or "créé" or "nouveau" => ActionPlanStatus.Created,
            "ongoing" or "en_cours" or "encours" or "ouvert" or "open" => ActionPlanStatus.Ongoing,
            "closed" or "cloture" or "clôturé" or "cloturee" or "clôturée" => ActionPlanStatus.Closed,
            "archived" or "archive" or "archivé" => ActionPlanStatus.Archived,
            _ when Enum.TryParse<ActionPlanStatus>(raw, true, out var parsed) => parsed,
            _ => null
        };
    }

    private static string? GetString(JsonElement args, string name)
    {
        if (args.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return null;
        if (!args.TryGetProperty(name, out var el)) return null;
        return el.ValueKind == JsonValueKind.String ? el.GetString() : el.ToString();
    }

    private static int? GetInt(JsonElement args, string name)
    {
        if (args.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return null;
        if (!args.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var n)) return n;
        if (el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), out var parsed)) return parsed;
        return null;
    }

    private static bool? GetBool(JsonElement args, string name)
    {
        if (args.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return null;
        if (!args.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind is JsonValueKind.True) return true;
        if (el.ValueKind is JsonValueKind.False) return false;
        if (el.ValueKind == JsonValueKind.String && bool.TryParse(el.GetString(), out var b)) return b;
        return null;
    }

    private static List<JsonElement> ExtractParts(JsonElement content)
    {
        var list = new List<JsonElement>();
        if (!content.TryGetProperty("parts", out var parts) || parts.ValueKind != JsonValueKind.Array)
            return list;
        foreach (var p in parts.EnumerateArray())
            list.Add(p.Clone());
        return list;
    }

    /// <summary>
    /// The parts of the model turn, sent back as they came: Gemini 3 models require the "thoughtSignature" that travels with a
    /// function call to be returned unchanged on the next request (rebuilding the parts dropped it and the call was refused with a 400).
    /// </summary>
    private static List<object> ClonePartsForRequest(IEnumerable<JsonElement> parts)
    {
        var list = new List<object>();
        foreach (var p in parts)
        {
            if (p.TryGetProperty("functionCall", out _) || p.TryGetProperty("text", out _))
                list.Add(p.Clone());
            // other kinds of part are ignored
        }
        return list;
    }

    private static string ExtractText(IEnumerable<JsonElement> parts)
    {
        var sb = new StringBuilder();
        foreach (var p in parts)
        {
            if (p.TryGetProperty("text", out var text))
            {
                var t = text.GetString();
                if (!string.IsNullOrWhiteSpace(t))
                {
                    if (sb.Length > 0) sb.Append('\n');
                    sb.Append(t);
                }
            }
        }
        return sb.ToString().Trim();
    }

    private static string CleanReply(string text)
    {
        var cleaned = text.Trim().Replace("**", "").Replace("__", "");
        return cleaned;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";
}
