namespace Coficab.ActionPlan.Core.DTOs.Claims;

public class QualityDashboardSummaryDto
{
    public int TotalClaims { get; set; }
    public int OpenClaims { get; set; }
    public int ValidatedFiveWhys { get; set; }
    public int PendingValidations { get; set; }
}