using System.Text;
using Coficab.ActionPlan.Application.Services;
using Coficab.ActionPlan.Core.Entities;
using Coficab.ActionPlan.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Coficab.ActionPlan.API.Tests;

public class QualityReportPdfTests
{
    [Fact]
    public async Task Pdf_IsStillGenerated_WhenThePriorityCauseTableIsUnavailable()
    {
        var options = new DbContextOptionsBuilder<ActionPlanDbContext>().UseInMemoryDatabase("pdf-" + Guid.NewGuid()).Options;
        using var db = new ActionPlanDbContext(options);

        var bytes = await new QualityReportPdfService(db).GenerateQualityReportPdfAsync(Guid.NewGuid());

        Assert.True(bytes.Length > 500);
        Assert.Equal("%PDF", Encoding.ASCII.GetString(bytes, 0, 4));
    }

    [Fact]
    public async Task Pdf_FollowsTheChain_WithIshikawaFiveWhyAndTheCapaPlan()
    {
        var options = new DbContextOptionsBuilder<ActionPlanDbContext>().UseInMemoryDatabase("pdf-" + Guid.NewGuid()).Options;
        using var db = new ActionPlanDbContext(options);
        var claimId = Guid.NewGuid();
        db.IshikawaCauses.Add(new IshikawaCause { Id = Guid.NewGuid(), ClaimId = claimId, Category = IshikawaCategory.Machine, CauseDescription = "Usure des électrodes", IsRootCause = true, CreatedBy = "t" });
        db.FiveWhyAnalyses.Add(new FiveWhyAnalysis { Id = Guid.NewGuid(), ClaimId = claimId, ProblemStatement = "Soudure défectueuse", RootCause = "Pas de remplacement planifié", StatusCode = "VALIDATED" });
        var planId = Guid.NewGuid();
        db.ActionPlans.Add(new Coficab.ActionPlan.Core.Entities.ActionPlan { Id = planId, Title = "Plan électrodes", ClaimId = claimId });
        db.PlanActions.Add(new PlanAction { Id = Guid.NewGuid(), ActionPlanId = planId, Title = "Planifier le remplacement", Order = 1 });
        await db.SaveChangesAsync();

        var bytes = await new QualityReportPdfService(db).GenerateQualityReportPdfAsync(claimId);

        Assert.Equal("%PDF", Encoding.ASCII.GetString(bytes, 0, 4));
        Assert.True(bytes.Length > 1500);
    }
}
