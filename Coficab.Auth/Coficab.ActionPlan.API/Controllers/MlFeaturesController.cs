using System.Security.Cryptography;
using System.Text;
using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Application.MlFeatures.Queries;
using Coficab.ActionPlan.Application.QualityAnalyses.Services;
using Microsoft.EntityFrameworkCore;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coficab.ActionPlan.API.Controllers;

/// <summary>
/// Features destinées au service ML (entraînement, anomalies, recommandation).
/// </summary>
[ApiController]
[Route("api/ml-features")]
[Authorize]
public class MlFeaturesController : ControllerBase
{
    private readonly IMediator _mediator;

    public MlFeaturesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>
    /// Nombre de claims créées par semaine (12 dernières semaines par défaut),
    /// pour chaque combinaison DefectType × ProductionLine.
    /// </summary>
    /// <param name="weeks">Nombre de semaines (1–52, défaut 12).</param>
    [HttpGet("anomaly-timeseries")]
    [ProducesResponseType(typeof(AnomalyTimeseriesDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AnomalyTimeseriesDto>> GetAnomalyTimeseries(
        [FromQuery] int weeks = 12,
        CancellationToken cancellationToken = default)
    {
        var result = await _mediator.Send(new GetAnomalyTimeseriesQuery(weeks), cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Dataset d'entraînement IsOnTime (DefectType, Severity, DepartmentId,
    /// EmployeeSkill, Workload) extrait des claims réalistes clôturées.
    /// Accès : jeton admin, ou en-tête <c>X-Dataset-Key</c> égal à
    /// <c>MlFeatures:DatasetApiKey</c> pour le notebook / pipeline ML (pas de JWT).
    /// Sans clé configurée, seul un admin peut l'appeler.
    /// </summary>
    [HttpGet("training-dataset")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(TrainingDatasetDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<object>> GetTrainingDataset(
        [FromServices] IAuthorizationService authorization,
        [FromServices] IConfiguration configuration,
        CancellationToken cancellationToken = default)
    {
        var isAdmin = (await authorization.AuthorizeAsync(User, "AdminOnly")).Succeeded;
        if (!isAdmin && !HasValidDatasetKey(configuration["MlFeatures:DatasetApiKey"]))
            return Unauthorized();

        var result = await _mediator.Send(new GetTrainingDatasetQuery(), cancellationToken);
        // Le notebook attend une liste, ou { items | data | rows }
        return Ok(new { count = result.Count, items = result.Items });
    }

    /// <summary>
    /// Punctuality history of candidate employees (smoothed on-time rate, closed claims, open claims) as of now.
    /// The recommendation model scores employees with these values.
    /// </summary>
    [HttpPost("employee-stats")]
    [ProducesResponseType(typeof(IReadOnlyList<EmployeeStatsDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<EmployeeStatsDto>>> GetEmployeeStats(
        [FromBody] EmployeeStatsRequest request,
        CancellationToken cancellationToken = default)
    {
        var result = await _mediator.Send(
            new GetEmployeeStatsQuery(request.EmployeeIds ?? new List<string>()), cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Photos of claims whose image proposal was corrected by the operator or was not confident enough (the learning signal of the image model),
    /// with the defect code the operator kept. Same access as the training dataset: admin token, or the X-Dataset-Key header.
    /// Only the photos the quality engineer VALIDATED train the model (status=validated, the default); status=pending is the review queue,
    /// rejected for the ones kept out, all for everything. A validated photo carries the engineer's code.
    /// </summary>
    [HttpGet("cv-corrections")]
    [AllowAnonymous]
    public async Task<ActionResult<object>> GetCvCorrections(
        [FromServices] IAuthorizationService authorization,
        [FromServices] IConfiguration configuration,
        [FromServices] IApplicationDbContext db,
        [FromQuery] string status = "validated",
        CancellationToken cancellationToken = default)
    {
        if (!await CanReadDatasetsAsync(authorization, configuration)) return Unauthorized();
        status = status.Trim().ToLowerInvariant();
        if (status is not ("validated" or "pending" or "rejected" or "all")) return BadRequest(new { message = "status: validated, pending, rejected or all." });

        var rows = await db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.AttachmentData != null && c.AttachmentContentType != null && c.AttachmentContentType.StartsWith("image/")
                        && c.CvPredictedDefectType != null
                        && (c.CvCorrectionLogged || (c.CvConfidence ?? 1.0) < CvFeedback.ConfidenceThreshold)
                        && (status == "all"
                            || (status == "validated" && c.CvValidationStatus == CvValidation.Validated)
                            || (status == "rejected" && c.CvValidationStatus == CvValidation.Rejected)
                            || (status == "pending" && c.CvValidationStatus == null)))
            .OrderBy(c => c.CreatedAt)
            .Select(c => new
            {
                claimId = c.Id,
                reference = c.Reference,
                title = c.Title,
                operatorDefectType = c.DefectType,
                validationStatus = c.CvValidationStatus,
                validatedAt = c.CvValidatedAt,
                defectType = c.CvValidationStatus == CvValidation.Validated && c.CvValidatedDefectType != null ? c.CvValidatedDefectType : c.DefectType,
                predictedDefectType = c.CvPredictedDefectType,
                confidence = c.CvConfidence,
                correctionLogged = c.CvCorrectionLogged,
                contentType = c.AttachmentContentType,
                fileName = c.AttachmentName,
                createdAt = c.CreatedAt,
            })
            .ToListAsync(cancellationToken);
        return Ok(new { count = rows.Count, items = rows });
    }

    /// <summary>The quality engineer's decision on a photo: VALIDATED (it may train the model, with the code given or else the operator's) or REJECTED. Admin only.</summary>
    [HttpPut("cv-corrections/{claimId:guid}/validation")]
    public async Task<IActionResult> ValidateCvCorrection(
        Guid claimId,
        [FromBody] CvValidationRequest request,
        [FromServices] IAuthorizationService authorization,
        [FromServices] IApplicationDbContext db,
        CancellationToken cancellationToken = default)
    {
        if (!(await authorization.AuthorizeAsync(User, "AdminOnly")).Succeeded) return Forbid();
        var decision = (request.Status ?? "").Trim().ToUpperInvariant();
        if (decision != CvValidation.Validated && decision != CvValidation.Rejected) return BadRequest(new { message = "Status must be VALIDATED or REJECTED." });

        var claim = await db.Claims.FirstOrDefaultAsync(c => c.Id == claimId && !c.IsArchived && c.AttachmentData != null && c.AttachmentContentType != null
                                                             && c.AttachmentContentType.StartsWith("image/") && c.CvPredictedDefectType != null, cancellationToken);
        if (claim is null) return NotFound();

        claim.CvValidationStatus = decision;
        claim.CvValidatedDefectType = decision == CvValidation.Validated ? (string.IsNullOrWhiteSpace(request.DefectType) ? claim.DefectType : request.DefectType.Trim()) : null;
        claim.CvValidatedById = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        claim.CvValidatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { claimId, status = claim.CvValidationStatus, defectType = claim.CvValidatedDefectType });
    }

    /// <summary>
    /// The past claims that hold a photo, for the similarity index of the image service (the photo is served by the next route).
    /// Same access as the training dataset.
    /// </summary>
    [HttpGet("claim-photos")]
    [AllowAnonymous]
    public async Task<ActionResult<object>> GetClaimPhotos(
        [FromServices] IAuthorizationService authorization,
        [FromServices] IConfiguration configuration,
        [FromServices] IApplicationDbContext db,
        CancellationToken cancellationToken = default)
    {
        if (!await CanReadDatasetsAsync(authorization, configuration)) return Unauthorized();

        var rows = await db.Claims.AsNoTracking()
            .Where(c => !c.IsArchived && c.AttachmentData != null && c.AttachmentContentType != null && c.AttachmentContentType.StartsWith("image/"))
            .OrderBy(c => c.CreatedAt)
            .Select(c => new { claimId = c.Id, reference = c.Reference, defectType = c.DefectType, severity = c.Severity, title = c.Title, createdAt = c.CreatedAt })
            .ToListAsync(cancellationToken);
        return Ok(new { count = rows.Count, items = rows });
    }

    /// <summary>The photo of one of those claims (bytes), for the export to the image model's training folder and for the similarity index.</summary>
    [HttpGet("cv-corrections/{claimId:guid}/photo")]
    [HttpGet("claim-photos/{claimId:guid}/photo")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCvCorrectionPhoto(
        Guid claimId,
        [FromServices] IAuthorizationService authorization,
        [FromServices] IConfiguration configuration,
        [FromServices] IApplicationDbContext db,
        CancellationToken cancellationToken = default)
    {
        if (!await CanReadDatasetsAsync(authorization, configuration)) return Unauthorized();

        var photo = await db.Claims.AsNoTracking()
            .Where(c => c.Id == claimId && !c.IsArchived && c.AttachmentData != null && c.AttachmentContentType != null && c.AttachmentContentType.StartsWith("image/"))
            .Select(c => new { c.AttachmentData, c.AttachmentContentType })
            .FirstOrDefaultAsync(cancellationToken);
        return photo is null ? NotFound() : File(photo.AttachmentData!, photo.AttachmentContentType!);
    }

    private async Task<bool> CanReadDatasetsAsync(IAuthorizationService authorization, IConfiguration configuration)
        => (await authorization.AuthorizeAsync(User, "AdminOnly")).Succeeded || HasValidDatasetKey(configuration["MlFeatures:DatasetApiKey"]);

    private bool HasValidDatasetKey(string? expected)
    {
        if (string.IsNullOrEmpty(expected))
            return false;

        var provided = Request.Headers["X-Dataset-Key"].ToString();
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(provided),
            Encoding.UTF8.GetBytes(expected));
    }
}

public record CvValidationRequest(string? Status, string? DefectType);

public static class CvValidation
{
    public const string Validated = "VALIDATED";
    public const string Rejected = "REJECTED";
}

public record EmployeeStatsRequest(List<string>? EmployeeIds);
