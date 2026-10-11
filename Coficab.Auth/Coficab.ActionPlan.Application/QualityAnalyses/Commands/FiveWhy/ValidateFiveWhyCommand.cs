using MediatR;
using System;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;

public class ValidateFiveWhyCommand : IRequest<bool>
{
    public Guid AnalysisId { get; set; }

    // Added ClaimId to match handler expectations
    public Guid ClaimId { get; set; }

    public bool IsApproved { get; set; }
    public string ValidatedBy { get; set; } = string.Empty;

    // Status passed for approval/rejection transitions
    public string? StatusCode { get; set; }
}