using System.Collections.Generic;

namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class ValidateFiveWhyStepRequestDto
{
    public int StepNumber { get; set; }
    /// <summary>OCCURRENCE | DETECTION</summary>
    public string Branch { get; set; } = "OCCURRENCE";
    public string ProblemStatement { get; set; } = string.Empty;
    public string ProposedAnswer { get; set; } = string.Empty;
    public List<FiveWhyStepDto> PreviousSteps { get; set; } = new();
}

public class ValidateFiveWhyStepResponseDto
{
    public bool IsAccepted { get; set; }
    /// <summary>OK | WARN | BLOCK</summary>
    public string Severity { get; set; } = "OK";
    public List<string> Flags { get; set; } = new();
    public string CoachMessage { get; set; } = string.Empty;
    public List<string> SuggestedFollowUpQuestions { get; set; } = new();
}
