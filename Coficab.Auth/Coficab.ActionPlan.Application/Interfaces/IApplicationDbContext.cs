using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Coficab.ActionPlan.Application.Interfaces;

public interface IApplicationDbContext
{
    DbSet<UserProfile> UserProfiles { get; }
    DbSet<Badge> Badges { get; }
    DbSet<Document> Documents { get; }
    DbSet<DocumentFavorite> DocumentFavorites { get; }
    DbSet<TimelineEvent> TimelineEvents { get; }
    DbSet<UserActionPlanAssignment> UserActionPlanAssignments { get; }
    DbSet<Coficab.ActionPlan.Core.Entities.ActionPlan> ActionPlans { get; }
    DbSet<PlanAction> PlanActions { get; }
    DbSet<ActionDocument> ActionDocuments { get; }
    DbSet<Department> Departments { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<ActionPlanHistory> ActionPlanHistories { get; }
    DbSet<PlanActionAssignmentHistory> PlanActionAssignmentHistories { get; }
    DbSet<FiveWhyAnalysis> FiveWhyAnalyses { get; }
    DbSet<FiveWhyStep> FiveWhySteps { get; }
    DbSet<IshikawaCause> IshikawaCauses { get; }

    // 🟢 AJOUTER CETTE LIGNE :
    DbSet<Coficab.ActionPlan.Core.Entities.Claim> Claims { get; }

    DbSet<Alert> Alerts { get; }
    DbSet<AlertTimelineEvent> AlertTimelineEvents { get; }
    DbSet<AlertReport> AlertReports { get; }
    DbSet<AlertComment> AlertComments { get; }
    DbSet<AlertAttachment> AlertAttachments { get; }
    DbSet<CalendarEvent> CalendarEvents { get; }
    DbSet<SemanticEmbedding> SemanticEmbeddings { get; }
    DbSet<ImportBatch> ImportBatches { get; }
    DbSet<ImportBatchClaim> ImportBatchClaims { get; }
    DbSet<PriorityCause> PriorityCauses { get; }
    DbSet<D4Override> D4Overrides { get; }
    DbSet<WorkflowStatus> WorkflowStatuses { get; }
    DbSet<WorkflowTransition> WorkflowTransitions { get; }
    DbSet<ReferenceItem> ReferenceItems { get; }
    DbSet<EightDVersion> EightDVersions { get; }
    DbSet<OverviewSetting> OverviewSettings { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    DbSet<IshikawaAnalysis> IshikawaAnalyses { get; set; }
    DbSet<EightDDossier> EightDDossiers { get; set; }
}
