using Coficab.ActionPlan.Core.DTOs.Claims;
using MediatR;
using System;
using System.Collections.Generic;

namespace Coficab.ActionPlan.Application.QualityAnalyses.Commands.FiveWhy;

public class CreateOrUpdateFiveWhyCommand : IRequest<Guid>
{
    public Guid ClaimId { get; set; }

    // Changed to { get; set; } so the controller can assign it
    public Guid? UserId { get; set; }

    public string ProblemStatement { get; set; } = string.Empty;
    public string RootCause { get; set; } = string.Empty;
    public string? RootCauseOccurrence { get; set; }
    public string? RootCauseDetection { get; set; }

    // Status passed from React frontend ("DRAFT" or "PENDING_VALIDATION")
    public string? StatusCode { get; set; } = "DRAFT";

    public List<FiveWhyStepDto> Steps { get; set; } = new();
}