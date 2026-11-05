using System;
using System.Collections.Generic;

namespace Coficab.ActionPlan.Core.DTOs.Claims
{
    public class SaveFiveWhyDto
    {
        public string ClaimId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string ProblemStatement { get; set; } = string.Empty;
        public string RootCause { get; set; } = string.Empty;
        public string StatusCode { get; set; } = "DRAFT";
        public List<FiveWhyStepDto> Steps { get; set; } = new();
    }

    public class FiveWhyStepDto
    {
        public int StepNumber { get; set; }
        public string BranchType { get; set; } = "OCCURRENCE";
        public string Question { get; set; } = string.Empty;
        public string Answer { get; set; } = string.Empty;
    }
}