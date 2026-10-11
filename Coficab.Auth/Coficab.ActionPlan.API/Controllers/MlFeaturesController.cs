using System.Security.Cryptography;
using System.Text;
using Coficab.ActionPlan.Application.MlFeatures.Queries;
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

public record EmployeeStatsRequest(List<string>? EmployeeIds);
