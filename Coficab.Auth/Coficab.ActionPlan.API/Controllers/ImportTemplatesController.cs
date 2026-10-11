using Coficab.ActionPlan.API.Services;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Coficab.ActionPlan.API.Controllers;

[ApiController]
[Route("api/import-templates")]
[Authorize]
public class ImportTemplatesController : ControllerBase
{
    private readonly ActionPlanDbContext _db;

    public ImportTemplatesController(ActionPlanDbContext db) => _db = db;

    [HttpGet("plans")]
    public IActionResult Plans([FromQuery] string? format) =>
        Download("plans", typeof(Coficab.ActionPlan.Core.Entities.ActionPlan), "modele-plans", format);

    [HttpGet("claims")]
    public IActionResult Claims([FromQuery] string? format) =>
        Download("claims", typeof(Coficab.ActionPlan.Core.Entities.Claim), "modele-reclamations", format);

    [HttpGet("employees")]
    public IActionResult Employees([FromQuery] string? format) =>
        Download("employees", typeof(Coficab.ActionPlan.Core.Entities.UserProfile), "modele-employes", format);

    [HttpGet("{entity}/columns")]
    public IActionResult Columns(string entity)
    {
        if (!TryType(entity, out var type))
            return NotFound(new { message = "Modèle inconnu." });
        if (!CanDownload())
            return Forbid();
        return Ok(new { columns = ImportTemplateComposer.Columns(_db.Model, type!, entity) });
    }

    private IActionResult Download(string entity, Type type, string filename, string? format)
    {
        if (!CanDownload())
            return Forbid();

        var normalized = string.IsNullOrWhiteSpace(format) ? "csv" : format.Trim().ToLowerInvariant();
        if (normalized is not ("csv" or "excel"))
            return BadRequest(new { message = "Format attendu : excel ou csv." });

        var columns = ImportTemplateComposer.Columns(_db.Model, type, entity);
        var bytes = ImportTemplateComposer.Build(columns, normalized);
        var extension = normalized == "excel" ? "xls" : "csv";
        var contentType = normalized == "excel"
            ? "application/vnd.ms-excel"
            : "text/csv";
        return File(bytes, contentType, $"{filename}.{extension}");
    }

    private static bool TryType(string entity, out Type? type)
    {
        switch (entity.Trim().ToLowerInvariant())
        {
            case "plans":
                type = typeof(Coficab.ActionPlan.Core.Entities.ActionPlan);
                return true;
            case "claims":
                type = typeof(Coficab.ActionPlan.Core.Entities.Claim);
                return true;
            case "employees":
                type = typeof(Coficab.ActionPlan.Core.Entities.UserProfile);
                return true;
            default:
                type = null;
                return false;
        }
    }

    private bool CanDownload()
    {
        var roles = User.FindAll("role")
            .Concat(User.FindAll(ClaimTypes.Role))
            .Select(claim => (claim.Value ?? string.Empty).Trim().ToLowerInvariant());
        return roles.Any(role => role is "admin" or "superadmin" or "admin_quality");
    }
}
