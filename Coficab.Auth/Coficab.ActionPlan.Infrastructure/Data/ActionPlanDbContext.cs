using Coficab.ActionPlan.Application.Interfaces;
using Coficab.ActionPlan.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using CoreEntities = Coficab.ActionPlan.Core.Entities;

namespace Coficab.ActionPlan.Infrastructure.Data;

public class ActionPlanDbContext : DbContext, IApplicationDbContext
{
    public ActionPlanDbContext(DbContextOptions<ActionPlanDbContext> options) : base(options) { }

    // ─── Tables existantes ─────────────────────────────────────────────
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Region> Regions => Set<Region>();
    public DbSet<Country> Countries => Set<Country>();
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Function> Functions => Set<Function>();
    public DbSet<UserFunction> UserFunctions => Set<UserFunction>();
    public DbSet<CoreEntities.ActionPlan> ActionPlans => Set<CoreEntities.ActionPlan>();
    public DbSet<PlanAction> PlanActions => Set<PlanAction>();
    public DbSet<PlanActionHistory> PlanActionHistories => Set<PlanActionHistory>();
    public DbSet<PlanActionAssignmentHistory> PlanActionAssignmentHistories => Set<PlanActionAssignmentHistory>();
    public DbSet<ActionDocument> ActionDocuments => Set<ActionDocument>();
    public DbSet<Licence> Licences => Set<Licence>();
    public DbSet<Module> Modules => Set<Module>();
    public DbSet<UserActionPlanAssignment> UserActionPlanAssignments => Set<UserActionPlanAssignment>();

    // ─── Employee Dashboard ────────────────────────────────────────────
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<UserAlias> UserAliases => Set<UserAlias>();
    public DbSet<ClaimEvent> ClaimEvents => Set<ClaimEvent>();
    public DbSet<SavedReport> SavedReports => Set<SavedReport>();
    public DbSet<ReportSchedule> ReportSchedules => Set<ReportSchedule>();
    public DbSet<Badge> Badges => Set<Badge>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentFavorite> DocumentFavorites => Set<DocumentFavorite>();
    public DbSet<TimelineEvent> TimelineEvents => Set<TimelineEvent>();
    public DbSet<ActionPlanHistory> ActionPlanHistories => Set<ActionPlanHistory>();
    public DbSet<Notification> Notifications => Set<Notification>();

    // 🆕 ─── MODULE 2 : Quality Analysis (Claims, 5 Why & Ishikawa) ─────
    public DbSet<CoreEntities.Claim> Claims => Set<CoreEntities.Claim>();
    public DbSet<FiveWhyAnalysis> FiveWhyAnalyses => Set<FiveWhyAnalysis>();
    public DbSet<FiveWhyStep> FiveWhySteps => Set<FiveWhyStep>();
    public DbSet<IshikawaCause> IshikawaCauses => Set<IshikawaCause>();
    public DbSet<IshikawaAnalysis> IshikawaAnalyses { get; set; } = null!;
    public DbSet<EightDDossier> EightDDossiers { get; set; } = null!;
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<AlertTimelineEvent> AlertTimelineEvents => Set<AlertTimelineEvent>();
    public DbSet<AlertReport> AlertReports => Set<AlertReport>();
    public DbSet<AlertComment> AlertComments => Set<AlertComment>();
    public DbSet<AlertAttachment> AlertAttachments => Set<AlertAttachment>();
    public DbSet<CalendarEvent> CalendarEvents => Set<CalendarEvent>();
    public DbSet<SemanticEmbedding> SemanticEmbeddings => Set<SemanticEmbedding>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<ImportBatchClaim> ImportBatchClaims => Set<ImportBatchClaim>();
    public DbSet<PriorityCause> PriorityCauses => Set<PriorityCause>();
    public DbSet<D4Override> D4Overrides => Set<D4Override>();
    public DbSet<WorkflowStatus> WorkflowStatuses => Set<WorkflowStatus>();
    public DbSet<WorkflowTransition> WorkflowTransitions => Set<WorkflowTransition>();
    public DbSet<ReferenceItem> ReferenceItems => Set<ReferenceItem>();
    public DbSet<EightDVersion> EightDVersions => Set<EightDVersion>();
    public DbSet<OverviewSetting> OverviewSettings => Set<OverviewSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("actionplan");
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ActionPlanDbContext).Assembly);

        // ─── UserActionPlanAssignment ─────────────────────────────────────
        modelBuilder.Entity<UserActionPlanAssignment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.ActionPlanId).IsRequired();
            entity.Property(e => e.CanView).IsRequired();
            entity.Property(e => e.CanEdit).IsRequired();
            entity.Property(e => e.CreatedAt).IsRequired();
            entity.Property(e => e.AssignedBy).HasMaxLength(450);

            entity.HasOne(e => e.ActionPlan)
                  .WithMany(a => a.UserAssignments)
                  .HasForeignKey(e => e.ActionPlanId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.UserId, e.ActionPlanId }).IsUnique();
        });

        // ─── ReportSchedule: reports generated by themselves ──────────────
        modelBuilder.Entity<ReportSchedule>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Kind).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Frequency).IsRequired().HasMaxLength(20);
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
            entity.Property(e => e.CreatedByName).HasMaxLength(300);
            entity.Property(e => e.LastError).HasMaxLength(1000);
            entity.Property(e => e.OrganizationIds).HasMaxLength(2000);
            entity.HasIndex(e => new { e.IsActive, e.IsArchived, e.NextRunAt });
        });

        // ─── SavedReport: reports kept by administrators ──────────────────
        modelBuilder.Entity<SavedReport>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Kind).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
            entity.Property(e => e.CreatedByName).HasMaxLength(300);
            entity.Property(e => e.ArchivedBy).HasMaxLength(450);
            entity.HasIndex(e => new { e.Kind, e.IsArchived, e.CreatedAt });
        });

        // ─── ClaimEvent: append-only audit of claims ──────────────────────
        modelBuilder.Entity<ClaimEvent>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ActionType).IsRequired().HasMaxLength(60);
            entity.Property(e => e.ActorId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.Detail).HasMaxLength(2000);
            entity.HasIndex(e => e.ClaimId);
            entity.HasIndex(e => e.CreatedAt);
        });

        // ─── UserAlias: merged accounts ───────────────────────────────────
        modelBuilder.Entity<UserAlias>(entity =>
        {
            entity.HasKey(e => e.OldUserId);
            entity.Property(e => e.OldUserId).HasMaxLength(450);
            entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.MergedBy).HasMaxLength(450);
            entity.HasIndex(e => e.UserId);
        });

        // ─── UserProfile ─────────────────────────────────────────────────
        modelBuilder.Entity<UserProfile>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.HasIndex(e => e.DepartmentId);
            entity.HasIndex(e => e.ManagerId);

            entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Role).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Phone).HasMaxLength(50);
            entity.Property(e => e.Poste).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Equipe).IsRequired().HasMaxLength(120);
            entity.Property(e => e.LigneProduction).HasMaxLength(120);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(20);
            entity.Property(e => e.ManagerId).HasMaxLength(450);
            entity.Property(e => e.ManagerName).HasMaxLength(200);
            entity.Property(e => e.ManagerEmail).HasMaxLength(200);

            entity.HasOne(e => e.Department)
                  .WithMany()
                  .HasForeignKey(e => e.DepartmentId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        // ─── Badge ───────────────────────────────────────────────────────
        modelBuilder.Entity<Badge>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => new { e.UserId, e.Category });
            entity.HasIndex(e => e.EarnedAt);

            entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.Icon).HasMaxLength(50);
            entity.Property(e => e.Color).HasMaxLength(20);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PlanTitle).HasMaxLength(200);
        });

        // ─── Document ────────────────────────────────────────────────────
        modelBuilder.Entity<Document>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Category);

            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Type).IsRequired().HasMaxLength(20);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.FilePath).IsRequired().HasMaxLength(500);
            entity.Property(e => e.ThumbnailUrl).HasMaxLength(500);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.LastViewedByUserId).HasMaxLength(450);
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        });

        // ─── DocumentFavorite ────────────────────────────────────────────
        modelBuilder.Entity<DocumentFavorite>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.DocumentId, e.UserId }).IsUnique();

            entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);

            entity.HasOne(e => e.Document)
                  .WithMany(d => d.Favorites)
                  .HasForeignKey(e => e.DocumentId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ─── TimelineEvent ───────────────────────────────────────────────
        modelBuilder.Entity<TimelineEvent>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.Timestamp);
            entity.HasIndex(e => new { e.UserId, e.Timestamp });

            entity.Property(e => e.UserId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.Type).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.PlanTitle).HasMaxLength(200);
            entity.Property(e => e.ActorName).HasMaxLength(200);
        });

        // ─── ActionPlanHistory ───────────────────────────────────────────
        modelBuilder.Entity<ActionPlanHistory>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasOne(e => e.ActionPlan)
                .WithMany()
                .HasForeignKey(e => e.ActionPlanId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(e => e.ActionType).HasMaxLength(50);
            entity.Property(e => e.Note).HasMaxLength(500);
            entity.Property(e => e.ChangedBy).HasMaxLength(100);
            entity.Property(e => e.ChangedByName).HasMaxLength(100);
            entity.Property(e => e.OldAssignedToId).HasMaxLength(100);
            entity.Property(e => e.NewAssignedToId).HasMaxLength(100);
            entity.Property(e => e.OldAssignedToName).HasMaxLength(100);
            entity.Property(e => e.NewAssignedToName).HasMaxLength(100);
        });

        // ─── PlanActionAssignmentHistory ─────────────────────────────────
        modelBuilder.Entity<PlanActionAssignmentHistory>(entity =>
        {
            entity.ToTable("PlanActionAssignmentHistory");
            entity.HasKey(e => e.Id);

            entity.HasOne(e => e.PlanAction)
                .WithMany(a => a.AssignmentHistory)
                .HasForeignKey(e => e.PlanActionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.PlanActionId);
            entity.HasIndex(e => e.CreatedAt);

            entity.Property(e => e.ActionType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Note).HasMaxLength(500);
            entity.Property(e => e.ChangedBy).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ChangedByName).HasMaxLength(100);
            entity.Property(e => e.OldAssignedToId).HasMaxLength(100);
            entity.Property(e => e.NewAssignedToId).HasMaxLength(100);
            entity.Property(e => e.OldAssignedToName).HasMaxLength(100);
            entity.Property(e => e.NewAssignedToName).HasMaxLength(100);
        });

        // ─── Notification ────────────────────────────────────────────────
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.RecipientId);
            entity.HasIndex(e => new { e.RecipientId, e.IsRead });

            entity.Property(e => e.RecipientId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.Type).IsRequired().HasMaxLength(80);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Message).HasMaxLength(500);
            entity.Property(e => e.LinkPath).HasMaxLength(300);

            entity.HasOne(e => e.ActionPlan)
                  .WithMany()
                  .HasForeignKey(e => e.ActionPlanId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        // 🆕 ─── CONFIGURATION MODULE 2 : Quality Analysis ───────────────
        modelBuilder.Entity<CoreEntities.Claim>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.StatusCode);
            entity.HasIndex(e => e.LotNumber);
            // Listing / filtering / dashboards: provider-agnostic indexes (list is ordered by CreatedAt desc, Id).
            entity.HasIndex(e => new { e.CreatedAt, e.Id });
            entity.HasIndex(e => e.CreatedById);
            entity.HasIndex(e => e.ClientId);
            entity.HasIndex(e => e.DefectType);
            entity.HasIndex(e => e.DetectionDate);

            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.ClientId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.DefectType).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Severity).IsRequired().HasMaxLength(50);
            entity.Property(e => e.LotNumber).IsRequired().HasMaxLength(100);
            entity.Property(e => e.SerialNumber).HasMaxLength(100);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.AssignedToId).HasMaxLength(100);
            entity.Property(e => e.AssignedToName).HasMaxLength(200);
            entity.HasIndex(e => e.AssignedToId);

            entity.Property(e => e.EstimateMethod).HasMaxLength(30);

            // Updated default value to PENDING
            entity.Property(e => e.StatusCode).IsRequired().HasMaxLength(50).HasDefaultValue("PENDING");
        });

        modelBuilder.Entity<FiveWhyAnalysis>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.ClaimId);

            entity.Property(e => e.ProblemStatement).IsRequired().HasMaxLength(1000);
            entity.Property(e => e.RootCause).HasMaxLength(4000);
            entity.Property(e => e.StatusCode).IsRequired().HasMaxLength(20).HasDefaultValue("PENDING");
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
            entity.Property(e => e.ValidatedBy).HasMaxLength(450);
            entity.Property(e => e.LastModifiedBy).HasMaxLength(450);
            entity.Property(e => e.ArchivedBy).HasMaxLength(450);
            entity.Property(e => e.ArchiveReason).HasMaxLength(500);

            entity.HasMany(e => e.Steps)
                  .WithOne()
                  .HasForeignKey(s => s.AnalysisId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FiveWhyStep>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Question).IsRequired().HasMaxLength(500);
            entity.Property(e => e.Answer).IsRequired().HasMaxLength(1000);
        });

        modelBuilder.Entity<IshikawaCause>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.ClaimId, e.Category });

            entity.Property(e => e.Category).HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.CauseDescription).IsRequired().HasMaxLength(500);
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
            entity.Property(e => e.ArchivedBy).HasMaxLength(450);
            entity.Property(e => e.ArchiveReason).HasMaxLength(500);
        });

        // ─── Alert (anomalies ML) ────────────────────────────────────────
        modelBuilder.Entity<Alert>(entity =>
        {
            entity.ToTable("Alerts");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Type).IsRequired().HasMaxLength(50);
            entity.Property(e => e.DefectType).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ProductionLine).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(1000);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(20);
            entity.Property(e => e.ZScore).IsRequired();
            entity.Property(e => e.CurrentCount).IsRequired();
            entity.Property(e => e.BaselineMean).IsRequired();
            entity.Property(e => e.DetectedAt).IsRequired();
            entity.Property(e => e.AiProblem).HasMaxLength(1000);
            entity.Property(e => e.AiProbableCause).HasMaxLength(1500);
            entity.Property(e => e.AiConsequences).HasMaxLength(1500);
            entity.Property(e => e.ArchiveReason).HasMaxLength(40);
            entity.Property(e => e.ArchivedBy).HasMaxLength(450);
            entity.Property(e => e.StatusBeforeArchive).HasMaxLength(20);

            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.DetectedAt);
            entity.HasIndex(e => new { e.Type, e.DefectType, e.ProductionLine, e.Status });

            entity.HasOne(e => e.Department)
                  .WithMany()
                  .HasForeignKey(e => e.DepartmentId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AlertTimelineEvent>(entity =>
        {
            entity.ToTable("AlertTimelineEvents");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EventType).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Detail).HasMaxLength(2000);
            entity.Property(e => e.ActorId).HasMaxLength(450);
            entity.Property(e => e.ActorName).HasMaxLength(200);
            entity.HasIndex(e => e.AlertId);
            entity.HasIndex(e => e.CreatedAt);
            entity.HasOne(e => e.Alert).WithMany().HasForeignKey(e => e.AlertId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AlertReport>(entity =>
        {
            entity.ToTable("AlertReports");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.AuthorId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.AuthorName).HasMaxLength(200);
            entity.Property(e => e.Content).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(20);
            entity.Property(e => e.ReviewNote).HasMaxLength(1000);
            entity.Property(e => e.ReviewedBy).HasMaxLength(450);
            entity.HasIndex(e => e.AlertId);
            entity.HasOne(e => e.Alert).WithMany().HasForeignKey(e => e.AlertId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AlertComment>(entity =>
        {
            entity.ToTable("AlertComments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.AuthorId).IsRequired().HasMaxLength(450);
            entity.Property(e => e.AuthorName).HasMaxLength(200);
            entity.Property(e => e.Body).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.ArchivedBy).HasMaxLength(450);
            entity.HasIndex(e => e.AlertId);
            entity.HasOne(e => e.Alert).WithMany().HasForeignKey(e => e.AlertId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AlertAttachment>(entity =>
        {
            entity.ToTable("AlertAttachments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FileName).IsRequired().HasMaxLength(260);
            entity.Property(e => e.ContentType).HasMaxLength(120);
            entity.Property(e => e.CreatedBy).HasMaxLength(450);
            entity.Property(e => e.ArchivedBy).HasMaxLength(450);
            entity.HasIndex(e => e.AlertId);
            entity.HasOne(e => e.Alert).WithMany().HasForeignKey(e => e.AlertId).OnDelete(DeleteBehavior.Restrict);
        });

        // ─── Global soft-delete filters ─────────────────────────────────
        modelBuilder.Entity<Organization>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Region>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Country>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Site>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Department>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Function>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<UserFunction>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<CoreEntities.ActionPlan>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<CoreEntities.ActionPlan>()
            .HasOne<Alert>()
            .WithMany()
            .HasForeignKey(p => p.AlertId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<PlanAction>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<ActionDocument>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Licence>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Module>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<Notification>().HasQueryFilter(e => !e.IsArchived);

        // 🆕 Soft-delete filters pour le Module 2
        modelBuilder.Entity<CoreEntities.Claim>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<FiveWhyAnalysis>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<FiveWhyStep>().HasQueryFilter(e => !e.IsArchived);
        modelBuilder.Entity<IshikawaCause>().HasQueryFilter(e => !e.IsArchived);

        modelBuilder.Entity<SemanticEmbedding>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EntityType).IsRequired().HasMaxLength(32);
            entity.Property(e => e.ContentHash).IsRequired().HasMaxLength(64);
            entity.Property(e => e.Model).IsRequired().HasMaxLength(80);
            entity.Property(e => e.EmbeddingJson).IsRequired();
            entity.HasIndex(e => new { e.EntityType, e.EntityId }).IsUnique();
            entity.HasIndex(e => e.EntityType);
        });

        // --- History import, priority cause, D4 releases (formerly created by raw SQL at startup) ---
        modelBuilder.Entity<ImportBatch>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Kind).IsRequired().HasMaxLength(40);
            entity.Property(e => e.FileName).IsRequired().HasMaxLength(260);
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(80);
        });

        modelBuilder.Entity<ImportBatchClaim>(entity =>
        {
            entity.HasKey(e => new { e.BatchId, e.ClaimId });
            entity.HasIndex(e => e.ClaimId);
        });

        modelBuilder.Entity<PriorityCause>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Category).HasMaxLength(20);
            entity.Property(e => e.CauseText).IsRequired().HasMaxLength(500);
            entity.Property(e => e.Source).IsRequired().HasMaxLength(20);
            entity.Property(e => e.SelectedById).IsRequired().HasMaxLength(80);
            entity.Property(e => e.SelectedByName).HasMaxLength(200);
            entity.HasIndex(e => new { e.ClaimId, e.SelectedAt });
            // One current choice per claim (filtered unique index).
            entity.HasIndex(e => e.ClaimId).IsUnique().HasDatabaseName("UX_PriorityCauses_Current").HasFilter("[IsCurrent] = 1");
        });

        modelBuilder.Entity<D4Override>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Reason).IsRequired().HasMaxLength(500);
            entity.Property(e => e.ByUserId).IsRequired().HasMaxLength(80);
            entity.Property(e => e.ByUserName).HasMaxLength(200);
            entity.HasIndex(e => e.ClaimId);
        });

        // --- Configurable claim workflow: default statuses and transitions (editable through api/workflow/claims) ---
        var seededAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        modelBuilder.Entity<WorkflowStatus>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.WorkflowKey).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Code).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Label).IsRequired().HasMaxLength(100);
            entity.Property(e => e.UpdatedBy).HasMaxLength(80);
            entity.HasIndex(e => new { e.WorkflowKey, e.Code }).IsUnique();
            entity.HasData(
                new WorkflowStatus { Id = Guid.Parse("124847a1-86ab-5d2b-a72f-3c2896c1baf5"), WorkflowKey = "claim", Code = "DRAFT", Label = "Brouillon", SortOrder = 1, IsFinal = false, IsActive = true, UpdatedAt = seededAt },
                new WorkflowStatus { Id = Guid.Parse("4447ab17-abd4-5fa3-8686-a730695820c6"), WorkflowKey = "claim", Code = "OUVERTE", Label = "Ouverte", SortOrder = 2, IsFinal = false, IsActive = true, UpdatedAt = seededAt },
                new WorkflowStatus { Id = Guid.Parse("5c4b8ef9-9e47-5c8e-9455-2ee447a84c23"), WorkflowKey = "claim", Code = "ASSIGNED", Label = "Assignée", SortOrder = 3, IsFinal = false, IsActive = true, UpdatedAt = seededAt },
                new WorkflowStatus { Id = Guid.Parse("b5e3f5fa-7fe9-5a4d-99e6-1ae2c8849870"), WorkflowKey = "claim", Code = "EN_ANALYSE", Label = "En analyse", SortOrder = 4, IsFinal = false, IsActive = true, UpdatedAt = seededAt },
                new WorkflowStatus { Id = Guid.Parse("ec63beb7-8bd5-5223-a057-6c9d882a1a95"), WorkflowKey = "claim", Code = "PENDING_VALIDATION", Label = "En attente de validation", SortOrder = 5, IsFinal = false, IsActive = true, UpdatedAt = seededAt },
                new WorkflowStatus { Id = Guid.Parse("0a6c9443-6062-5a62-8677-7f32789530ff"), WorkflowKey = "claim", Code = "CLOTUREE", Label = "Clôturée", SortOrder = 6, IsFinal = true, IsActive = true, UpdatedAt = seededAt },
                new WorkflowStatus { Id = Guid.Parse("1bdc033b-895c-550c-a865-fa3b6b47cac9"), WorkflowKey = "claim", Code = "VALIDATED", Label = "Validée", SortOrder = 7, IsFinal = false, IsActive = true, UpdatedAt = seededAt },
                new WorkflowStatus { Id = Guid.Parse("e4c8d374-d934-58e3-927d-6288f7faa1e4"), WorkflowKey = "claim", Code = "REJECTED", Label = "Rejetée", SortOrder = 8, IsFinal = false, IsActive = true, UpdatedAt = seededAt });
        });

        modelBuilder.Entity<WorkflowTransition>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.WorkflowKey).IsRequired().HasMaxLength(40);
            entity.Property(e => e.FromCode).IsRequired().HasMaxLength(40);
            entity.Property(e => e.ToCode).IsRequired().HasMaxLength(40);
            entity.Property(e => e.AllowedRoles).IsRequired().HasMaxLength(100);
            entity.Property(e => e.UpdatedBy).HasMaxLength(80);
            entity.HasIndex(e => new { e.WorkflowKey, e.FromCode, e.ToCode }).IsUnique();
            entity.HasData(
                new WorkflowTransition { Id = Guid.Parse("3e260446-d203-54fe-9eed-65465a826286"), WorkflowKey = "claim", FromCode = "DRAFT", ToCode = "OUVERTE", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("fc66e926-12fb-5910-8589-1aa9c613d804"), WorkflowKey = "claim", FromCode = "DRAFT", ToCode = "PENDING_VALIDATION", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("e64769d9-648b-5e02-ac7d-965d48041710"), WorkflowKey = "claim", FromCode = "PENDING_VALIDATION", ToCode = "OUVERTE", AllowedRoles = "admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("81959958-244c-548f-8ca6-8f08adaa9300"), WorkflowKey = "claim", FromCode = "PENDING_VALIDATION", ToCode = "DRAFT", AllowedRoles = "admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("a19deeb1-f418-566b-94c3-812e87943405"), WorkflowKey = "claim", FromCode = "PENDING_VALIDATION", ToCode = "CLOTUREE", AllowedRoles = "admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("49a592f5-7451-551b-8efc-d9bd53c8d89a"), WorkflowKey = "claim", FromCode = "PENDING_VALIDATION", ToCode = "EN_ANALYSE", AllowedRoles = "admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("99b87926-4b49-5705-a0a6-1acf5e5f8c91"), WorkflowKey = "claim", FromCode = "OUVERTE", ToCode = "ASSIGNED", AllowedRoles = "admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("c21ed420-0a7c-55eb-97cc-5c7d6ac82c18"), WorkflowKey = "claim", FromCode = "OUVERTE", ToCode = "EN_ANALYSE", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("cafdafe8-a361-5107-9923-a90b923a8656"), WorkflowKey = "claim", FromCode = "ASSIGNED", ToCode = "OUVERTE", AllowedRoles = "admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("f7b2a058-eaac-506f-ade8-8d6ca5d93ea4"), WorkflowKey = "claim", FromCode = "ASSIGNED", ToCode = "EN_ANALYSE", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("fcfc676c-39cb-5d67-9332-d3818931f051"), WorkflowKey = "claim", FromCode = "EN_ANALYSE", ToCode = "PENDING_VALIDATION", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("893aad5f-345a-53ed-8398-b86fe1743456"), WorkflowKey = "claim", FromCode = "OUVERTE", ToCode = "PENDING_VALIDATION", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("46e1ca00-2ba1-5a5f-aff7-50bad42816bc"), WorkflowKey = "claim", FromCode = "ASSIGNED", ToCode = "PENDING_VALIDATION", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("ecbba46d-3347-5a9c-a5f3-08e8b2d76c40"), WorkflowKey = "claim", FromCode = "CLOTUREE", ToCode = "EN_ANALYSE", AllowedRoles = "admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("b0055ee5-8cd3-57c6-b034-4b6a592fe8e3"), WorkflowKey = "claim", FromCode = "VALIDATED", ToCode = "CLOTUREE", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("5604ff62-a2f0-5e1d-9428-ca8b1c6bf310"), WorkflowKey = "claim", FromCode = "VALIDATED", ToCode = "EN_ANALYSE", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("41c20e8a-6e6a-526e-93e7-4bc23bdcd1d6"), WorkflowKey = "claim", FromCode = "REJECTED", ToCode = "EN_ANALYSE", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt },
                new WorkflowTransition { Id = Guid.Parse("5d583d3e-99ac-5ea5-b59e-eeb0f6ac348a"), WorkflowKey = "claim", FromCode = "REJECTED", ToCode = "OUVERTE", AllowedRoles = "user,admin,superadmin", IsActive = true, UpdatedAt = seededAt });
        });

        // --- Multi-industry reference lists: defect types (free vocabulary) and severity wording (4 fixed levels) ---
        // --- Version history of the 8D dossier (append-only snapshots) ---
        modelBuilder.Entity<EightDVersion>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EventType).IsRequired().HasMaxLength(20);
            entity.Property(e => e.SavedById).HasMaxLength(80);
            entity.Property(e => e.StatusCode).IsRequired().HasMaxLength(30);
            entity.Property(e => e.ChangedFields).IsRequired().HasMaxLength(600);
            entity.Property(e => e.Comment).HasMaxLength(1000);
            entity.Property(e => e.SnapshotJson).IsRequired();
            entity.HasIndex(e => new { e.DossierId, e.VersionNumber }).IsUnique();
            entity.HasIndex(e => e.ClaimId);
        });

        modelBuilder.Entity<OverviewSetting>(entity =>
        {
            entity.HasKey(e => e.Key);
            entity.Property(e => e.Key).HasMaxLength(100);
            entity.Property(e => e.UpdatedBy).HasMaxLength(80);
        });

        modelBuilder.Entity<ReferenceItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ListKey).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Value).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Label).HasMaxLength(100);
            entity.Property(e => e.MergedInto).HasMaxLength(100);
            entity.Property(e => e.UpdatedBy).HasMaxLength(80);
            entity.HasIndex(e => new { e.ListKey, e.Value }).IsUnique();
            entity.HasData(
                new ReferenceItem { Id = Guid.Parse("a0e73aba-3378-5776-b27f-e27f9dccd9ed"), ListKey = "severity", Value = "LOW", SortOrder = 1, IsActive = true, UpdatedAt = seededAt },
                new ReferenceItem { Id = Guid.Parse("1d582aaa-84f1-5c3f-8278-f838abb8206f"), ListKey = "severity", Value = "MEDIUM", SortOrder = 2, IsActive = true, UpdatedAt = seededAt },
                new ReferenceItem { Id = Guid.Parse("214aa64f-ded3-5445-8a67-91e1235e76b9"), ListKey = "severity", Value = "HIGH", SortOrder = 3, IsActive = true, UpdatedAt = seededAt },
                new ReferenceItem { Id = Guid.Parse("3b1d0a50-c63c-5a29-a5dd-ab5efae6c7c1"), ListKey = "severity", Value = "CRITICAL", SortOrder = 4, IsActive = true, UpdatedAt = seededAt });
        });

        // SQL Server rejects ambiguous cascade paths; nothing is ever deleted here, so those links become Restrict.
        Coficab.Auth.API.Data.SqlServerCascadeGuard.RestrictAmbiguousCascades(modelBuilder);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<DateTime>()
            .HaveConversion<UtcDateTimeConverter>();

        configurationBuilder.Properties<DateTime?>()
            .HaveConversion<UtcNullableDateTimeConverter>();
    }
}

// ─── Converters ──────────────────────────────────────────────────────
public class UtcDateTimeConverter : ValueConverter<DateTime, DateTime>
{
    public UtcDateTimeConverter()
        : base(
            v => v.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(v, DateTimeKind.Utc)
                : v.ToUniversalTime(),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc))
    { }
}

public class UtcNullableDateTimeConverter : ValueConverter<DateTime?, DateTime?>
{
    public UtcNullableDateTimeConverter()
        : base(
            v => v.HasValue
                ? (v.Value.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc)
                    : v.Value.ToUniversalTime())
                : null,
            v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : null)
    { }
}