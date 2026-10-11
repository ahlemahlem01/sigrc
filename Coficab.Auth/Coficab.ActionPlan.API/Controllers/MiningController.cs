using System.Security.Claims;
using Coficab.ActionPlan.Application.ReferenceLists;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Coficab.ActionPlan.Infrastructure.Data;
using Coficab.ActionPlan.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// Data mining over the closed-dossier history (weighted Pareto, association rules, root causes,
/// similar cases), computed by the ML service. Read-only.
/// Visibility is decided here, on the server: employees only get aggregates, never the dossiers
/// of other people (see ml-service/mining.py, `restricted`).
/// If the ML service is down or the history is thin, the answer says so and everything else in
/// the app keeps working by hand.
/// </summary>
[ApiController]
[Authorize]
[Route("api/mining")]
public class MiningController : ControllerBase
{
    private const int MaxHistory = 3000;

    private readonly ActionPlanDbContext _db;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<MiningController> _logger;

    public MiningController(ActionPlanDbContext db, IHttpClientFactory http, IConfiguration config, ILogger<MiningController> logger)
    {
        _db = db;
        _http = http;
        _config = config;
        _logger = logger;
    }

    public sealed class InsightsRequest
    {
        public Guid? ClaimId { get; set; }
        public string? DefectType { get; set; }
        public string? ProductionLine { get; set; }
        public string? Shift { get; set; }
        public string? ClientId { get; set; }
    }

    [HttpPost("insights")]
    public async Task<IActionResult> Insights([FromBody] InsightsRequest request, CancellationToken ct)
    {
        var admin = IsAdmin();
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var defectTypes = await DefectTypeResolver.LoadAsync(_db, ct);

        var current = new Dictionary<string, object?>
        {
            ["defectType"] = request.DefectType == null ? null : defectTypes.Resolve(request.DefectType),
            ["productionLine"] = request.ProductionLine,
            ["shift"] = request.Shift,
            ["clientId"] = request.ClientId,
        };

        if (request.ClaimId is { } claimId)
        {
            var claim = await _db.Claims.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(c => c.Id == claimId, ct);
            if (claim == null) return NotFound(new { message = "Réclamation introuvable." });
            if (!admin && !string.Equals(claim.CreatedById, userId, StringComparison.OrdinalIgnoreCase)
                       && !string.Equals(claim.AssignedToId, userId, StringComparison.OrdinalIgnoreCase))
                return Forbid();

            current = new Dictionary<string, object?>
            {
                ["id"] = claim.Id,
                ["defectType"] = defectTypes.Resolve(claim.DefectType),
                ["productionLine"] = claim.ProductionLine,
                ["shift"] = claim.Shift,
                ["clientId"] = claim.ClientId,
                ["lotNumber"] = claim.LotNumber,
                ["severity"] = claim.Severity,
                ["title"] = claim.Title,
                ["description"] = claim.Description,
            };

            // The analyst's own Ishikawa causes: the ML service ranks them by what comparable dossiers recorded.
            var own = await _db.IshikawaCauses.AsNoTracking()
                .Where(c => c.ClaimId == claimId)
                .Select(c => new { c.Id, c.Category, c.CauseDescription })
                .ToListAsync(ct);
            current["causeCandidates"] = own
                .Select(c => new { id = c.Id, category = c.Category.ToString(), text = c.CauseDescription })
                .ToList();
        }

        var history = await LoadHistoryAsync(request.ClaimId, ct);

        var body = JsonSerializer.Serialize(new { history, current, restricted = !admin });
        var baseUrl = (_config["MlService:BaseUrl"] ?? "http://127.0.0.1:8001").TrimEnd('/');

        try
        {
            using var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(20);
            using var content = new StringContent(body, Encoding.UTF8, "application/json");
            using var response = await client.PostAsync($"{baseUrl}/mine/insights", content, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("ML mining returned {Status}", (int)response.StatusCode);
                return Ok(new { available = false, reason = "ml_error" });
            }

            var node = JsonNode.Parse(await response.Content.ReadAsStringAsync(ct))!.AsObject();
            node["available"] = true;
            return Content(node.ToJsonString(), "application/json");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogWarning(ex, "ML mining unavailable");
            return Ok(new { available = false, reason = "ml_unavailable" });
        }
    }

    private async Task<List<object>> LoadHistoryAsync(Guid? excludeClaimId, CancellationToken ct)
    {
        var claims = (await HistoryScope.ClaimsAsync(_db))
            .AsNoTracking()
            .Where(c => HistoryScope.ClosedStatuses.Contains(c.StatusCode));
        if (excludeClaimId is { } id)
            claims = claims.Where(c => c.Id != id);

        var rows = await claims
            .OrderByDescending(c => c.DetectionDate)
            .Take(MaxHistory)
            .Select(c => new
            {
                c.Id, c.Title, c.DefectType, c.ProductionLine, c.Shift, c.ClientId, c.Severity, c.LotNumber,
                c.Description, c.DetectionDate, c.ProducedQuantity, c.DefectiveQuantity,
            })
            .ToListAsync(ct);

        var defectTypes = await DefectTypeResolver.LoadAsync(_db, ct);
        var ids = rows.Select(r => r.Id).ToList();
        var causes = ids.Count == 0
            ? new List<(Guid ClaimId, string Category, string Text, bool IsRoot)>()
            : (await _db.IshikawaCauses.AsNoTracking()
                .Where(c => ids.Contains(c.ClaimId))
                .Select(c => new { c.ClaimId, c.Category, c.CauseDescription, c.IsRootCause })
                .ToListAsync(ct))
                .Select(c => (ClaimId: c.ClaimId, Category: c.Category.ToString(), Text: c.CauseDescription, IsRoot: c.IsRootCause))
                .ToList();
        var byClaim = causes.ToLookup(c => c.ClaimId);

        return rows.Select(r => (object)new
        {
            id = r.Id,
            title = r.Title,
            defectType = defectTypes.Resolve(r.DefectType),
            productionLine = r.ProductionLine,
            shift = r.Shift,
            clientId = r.ClientId,
            severity = r.Severity,
            lotNumber = r.LotNumber,
            description = r.Description,
            detectionDate = r.DetectionDate,
            produced = r.ProducedQuantity,
            defective = r.DefectiveQuantity,
            causes = byClaim[r.Id].Select(c => new { category = c.Category, text = c.Text, isRoot = c.IsRoot }).ToList(),
        }).ToList();
    }

    private bool IsAdmin()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(c => (c.Value ?? string.Empty).Trim().ToLowerInvariant());
        return roles.Any(r => r is "admin" or "superadmin");
    }
}
