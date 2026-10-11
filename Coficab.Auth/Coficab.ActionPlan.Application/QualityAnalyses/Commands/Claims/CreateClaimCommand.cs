using MediatR;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Coficab.ActionPlan.Core.Enums;
namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.Claims;
public class CreateClaimCommand : IRequest<Guid>
{
    public string Title { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string DefectType { get; set; } = string.Empty;
    public ClaimSeverity Severity { get; set; }
    public DateTime DetectionDate { get; set; }
    public string LotNumber { get; set; } = string.Empty;
    public string? SerialNumber { get; set; }
    public string Description { get; set; } = string.Empty;
    [JsonIgnore]
    public Guid CreatedById { get; set; }
    public string? RawEmailContent { get; set; }
    // 📌 Remplacement du DTO binaire par le type natif .NET Multipart
    public IFormFile? Attachment { get; set; }
    public string? StatusCode { get; set; }
    // 📌 Quantités pour le calcul du PPM lié au défaut (optionnelles : souvent
    // inconnues à la création du claim, renseignées plus tard).
    public int? ProducedQuantity { get; set; }
    public int? DefectiveQuantity { get; set; }
    /// <summary>Optional assignee (Identity user id). When set, status becomes ASSIGNED.</summary>
    public string? AssignedToId { get; set; }
    public string? AssignedToName { get; set; }
}