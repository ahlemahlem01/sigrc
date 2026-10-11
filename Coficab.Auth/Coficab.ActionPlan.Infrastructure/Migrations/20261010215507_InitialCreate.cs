using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "actionplan");

            migrationBuilder.CreateTable(
                name: "Badges",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Icon = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Color = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    EarnedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PlanTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Badges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CalendarEvents",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    StartAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AllDay = table.Column<bool>(type: "bit", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EventType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Importance = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Color = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ActionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ExternalUid = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OwnerId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsCompanyWide = table.Column<bool>(type: "bit", nullable: false),
                    TargetUserIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TargetDepartmentIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CalendarEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Claims",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ClientId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DefectType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Severity = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    LotNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SerialNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    StatusCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false, defaultValue: "PENDING"),
                    AssignedToId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    AssignedToName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    AssignedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Deadline = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsOnTime = table.Column<bool>(type: "bit", nullable: true),
                    EstimatedDaysP50 = table.Column<double>(type: "float", nullable: true),
                    EstimatedDaysP80 = table.Column<double>(type: "float", nullable: true),
                    EstimateMethod = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    EstimateSampleSize = table.Column<int>(type: "int", nullable: true),
                    EstimatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DetectionDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedById = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    AttachmentName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AttachmentContentType = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AttachmentData = table.Column<byte[]>(type: "varbinary(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedById = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ProductionLine = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Shift = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AnalysisNotes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ProducedQuantity = table.Column<int>(type: "int", nullable: true),
                    DefectiveQuantity = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Claims", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "D4Overrides",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ByUserId = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    ByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    At = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_D4Overrides", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Documents",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    FilePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastViewedByUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    LastViewedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Documents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EightDDossiers",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrentStep = table.Column<int>(type: "int", nullable: false),
                    StatusCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ChampionId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ChampionName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TeamMembers = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TeamFormedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ContainmentDescription = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ContainmentOwner = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ContainmentImplementedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ContainmentVerified = table.Column<bool>(type: "bit", nullable: false),
                    EffectivenessMethod = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    LotsChecked = table.Column<int>(type: "int", nullable: true),
                    DefectsFound = table.Column<int>(type: "int", nullable: true),
                    EffectivenessNotes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    EffectivenessValidated = table.Column<bool>(type: "bit", nullable: false),
                    EffectivenessValidatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PreventiveDescription = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PreventiveScope = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PreventiveStandardized = table.Column<bool>(type: "bit", nullable: false),
                    PreventiveCompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CongratulationsNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CustomerName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ClosedById = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CustomerPdfGeneratedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CustomerPdfData = table.Column<byte[]>(type: "varbinary(max)", nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SubmittedById = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ValidatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ValidatedById = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ValidationComment = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EightDDossiers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EightDVersions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DossierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false),
                    EventType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SavedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SavedById = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    StatusCode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    CurrentStep = table.Column<int>(type: "int", nullable: false),
                    ChangedFields = table.Column<string>(type: "nvarchar(600)", maxLength: 600, nullable: false),
                    Comment = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EightDVersions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FiveWhyAnalyses",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProblemStatement = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RootCause = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    RootCauseOccurrence = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RootCauseDetection = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    StatusCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "PENDING"),
                    IsValidated = table.Column<bool>(type: "bit", nullable: false),
                    ValidatedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ValidatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    LastModifiedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastModifiedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ArchiveReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiveWhyAnalyses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ImportBatchClaims",
                schema: "actionplan",
                columns: table => new
                {
                    BatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportBatchClaims", x => new { x.BatchId, x.ClaimId });
                });

            migrationBuilder.CreateTable(
                name: "ImportBatches",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    ClaimCount = table.Column<int>(type: "int", nullable: false),
                    CauseCount = table.Column<int>(type: "int", nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportBatches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IshikawaAnalyses",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProblemStatement = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StatusCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsValidated = table.Column<bool>(type: "bit", nullable: false),
                    ValidatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ValidatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Categories = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IshikawaAnalyses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IshikawaCauses",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CauseDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsRootCause = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ArchiveReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IshikawaCauses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Modules",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Modules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Organizations",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Organizations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PriorityCauses",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    CauseText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SelectedById = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    SelectedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    SelectedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsCurrent = table.Column<bool>(type: "bit", nullable: false),
                    SupersededAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriorityCauses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ReferenceItems",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ListKey = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Value = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    MergedInto = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReferenceItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SemanticEmbeddings",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ContentHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Model = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    EmbeddingJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EmbeddedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SemanticEmbeddings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TimelineEvents",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Timestamp = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PlanTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    BadgeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimelineEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowStatuses",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkflowKey = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsFinal = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowStatuses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowTransitions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkflowKey = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    FromCode = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ToCode = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AllowedRoles = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowTransitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DocumentFavorites",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    AddedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentFavorites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentFavorites_Documents_DocumentId",
                        column: x => x.DocumentId,
                        principalSchema: "actionplan",
                        principalTable: "Documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FiveWhySteps",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AnalysisId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StepNumber = table.Column<int>(type: "int", nullable: false),
                    Question = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Answer = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiveWhySteps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FiveWhySteps_FiveWhyAnalyses_AnalysisId",
                        column: x => x.AnalysisId,
                        principalSchema: "actionplan",
                        principalTable: "FiveWhyAnalyses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Regions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Regions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Regions_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalSchema: "actionplan",
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Countries",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    RegionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Countries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Countries_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalSchema: "actionplan",
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Countries_Regions_RegionId",
                        column: x => x.RegionId,
                        principalSchema: "actionplan",
                        principalTable: "Regions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Sites",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CountryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sites_Countries_CountryId",
                        column: x => x.CountryId,
                        principalSchema: "actionplan",
                        principalTable: "Countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Sites_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalSchema: "actionplan",
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Departments",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SiteId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RegionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Departments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Departments_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalSchema: "actionplan",
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Departments_Regions_RegionId",
                        column: x => x.RegionId,
                        principalSchema: "actionplan",
                        principalTable: "Regions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Departments_Sites_SiteId",
                        column: x => x.SiteId,
                        principalSchema: "actionplan",
                        principalTable: "Sites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Licences",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Key = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IsGlobal = table.Column<bool>(type: "bit", nullable: false),
                    MaxUsers = table.Column<int>(type: "int", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SiteId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Licences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Licences_Sites_SiteId",
                        column: x => x.SiteId,
                        principalSchema: "actionplan",
                        principalTable: "Sites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Alerts",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DefectType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ProductionLine = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ZScore = table.Column<double>(type: "float", nullable: false),
                    CurrentCount = table.Column<int>(type: "int", nullable: false),
                    BaselineMean = table.Column<double>(type: "float", nullable: false),
                    DetectedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ArchiveReason = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    StatusBeforeArchive = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AiProblem = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    AiProbableCause = table.Column<string>(type: "nvarchar(1500)", maxLength: 1500, nullable: true),
                    AiConsequences = table.Column<string>(type: "nvarchar(1500)", maxLength: 1500, nullable: true),
                    AiAnalyzedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Alerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Alerts_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalSchema: "actionplan",
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Functions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FunctionCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    HierarchicalLink = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FunctionalLink = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    JobDescriptionFilePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Functions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Functions_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalSchema: "actionplan",
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserProfiles",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Poste = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LigneProduction = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Equipe = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    ProfilePictureUrl = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ManagerId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ManagerName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ManagerEmail = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    HireDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ActivityStatus = table.Column<int>(type: "int", nullable: false),
                    LastActivityAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastLoginAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ActivityStatusComputedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserProfiles_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalSchema: "actionplan",
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ActionPlans",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    OwnerId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssignedToId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Deadline = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AlertId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsOnTime = table.Column<bool>(type: "bit", nullable: true),
                    Progress = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActionPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActionPlans_Alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "actionplan",
                        principalTable: "Alerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ActionPlans_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalSchema: "actionplan",
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ActionPlans_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalSchema: "actionplan",
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AlertAttachments",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AlertId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Data = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlertAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlertAttachments_Alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "actionplan",
                        principalTable: "Alerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AlertComments",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AlertId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AuthorId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    AuthorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Body = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlertComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlertComments_Alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "actionplan",
                        principalTable: "Alerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AlertReports",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AlertId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AuthorId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    AuthorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Content = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ReviewNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ReviewedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlertReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlertReports_Alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "actionplan",
                        principalTable: "Alerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AlertTimelineEvents",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AlertId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ActorId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ActorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RelatedId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlertTimelineEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlertTimelineEvents_Alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "actionplan",
                        principalTable: "Alerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserFunctions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FunctionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    HireDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserFunctions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserFunctions_Functions_FunctionId",
                        column: x => x.FunctionId,
                        principalSchema: "actionplan",
                        principalTable: "Functions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ActionPlanHistories",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChangedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ChangedByName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ActionType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    OldStatus = table.Column<int>(type: "int", nullable: true),
                    NewStatus = table.Column<int>(type: "int", nullable: true),
                    ChangesJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OldAssignedToId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    NewAssignedToId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    OldAssignedToName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    NewAssignedToName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ActionPlanId1 = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActionPlanHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActionPlanHistories_ActionPlans_ActionPlanId",
                        column: x => x.ActionPlanId,
                        principalSchema: "actionplan",
                        principalTable: "ActionPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ActionPlanHistories_ActionPlans_ActionPlanId1",
                        column: x => x.ActionPlanId1,
                        principalSchema: "actionplan",
                        principalTable: "ActionPlans",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Notifications",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecipientId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ActionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    LinkPath = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    IsRead = table.Column<bool>(type: "bit", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Notifications_ActionPlans_ActionPlanId",
                        column: x => x.ActionPlanId,
                        principalSchema: "actionplan",
                        principalTable: "ActionPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "PlanActions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Progress = table.Column<int>(type: "int", nullable: false),
                    Deadline = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    AssignedToId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ActionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Order = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanActions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanActions_ActionPlans_ActionPlanId",
                        column: x => x.ActionPlanId,
                        principalSchema: "actionplan",
                        principalTable: "ActionPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserActionPlanAssignments",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    ActionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CanView = table.Column<bool>(type: "bit", nullable: false),
                    CanEdit = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AssignedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserActionPlanAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserActionPlanAssignments_ActionPlans_ActionPlanId",
                        column: x => x.ActionPlanId,
                        principalSchema: "actionplan",
                        principalTable: "ActionPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ActionDocuments",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FilePath = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FileType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UploadedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PlanActionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActionDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActionDocuments_PlanActions_PlanActionId",
                        column: x => x.PlanActionId,
                        principalSchema: "actionplan",
                        principalTable: "PlanActions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlanActionAssignmentHistory",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlanActionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChangedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ChangedByName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ActionType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    OldAssignedToId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    NewAssignedToId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    OldAssignedToName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    NewAssignedToName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanActionAssignmentHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanActionAssignmentHistory_PlanActions_PlanActionId",
                        column: x => x.PlanActionId,
                        principalSchema: "actionplan",
                        principalTable: "PlanActions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlanActionHistories",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlanActionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChangedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    OldProgress = table.Column<int>(type: "int", nullable: false),
                    NewProgress = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    PlanActionId1 = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ArchivedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanActionHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanActionHistories_PlanActions_PlanActionId",
                        column: x => x.PlanActionId,
                        principalSchema: "actionplan",
                        principalTable: "PlanActions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlanActionHistories_PlanActions_PlanActionId1",
                        column: x => x.PlanActionId1,
                        principalSchema: "actionplan",
                        principalTable: "PlanActions",
                        principalColumn: "Id");
                });

            migrationBuilder.InsertData(
                schema: "actionplan",
                table: "ReferenceItems",
                columns: new[] { "Id", "IsActive", "Label", "ListKey", "MergedInto", "SortOrder", "UpdatedAt", "UpdatedBy", "Value" },
                values: new object[,]
                {
                    { new Guid("1d582aaa-84f1-5c3f-8278-f838abb8206f"), true, null, "severity", null, 2, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "MEDIUM" },
                    { new Guid("214aa64f-ded3-5445-8a67-91e1235e76b9"), true, null, "severity", null, 3, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "HIGH" },
                    { new Guid("3b1d0a50-c63c-5a29-a5dd-ab5efae6c7c1"), true, null, "severity", null, 4, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "CRITICAL" },
                    { new Guid("a0e73aba-3378-5776-b27f-e27f9dccd9ed"), true, null, "severity", null, 1, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "LOW" }
                });

            migrationBuilder.InsertData(
                schema: "actionplan",
                table: "WorkflowStatuses",
                columns: new[] { "Id", "Code", "IsActive", "IsFinal", "Label", "SortOrder", "UpdatedAt", "UpdatedBy", "WorkflowKey" },
                values: new object[,]
                {
                    { new Guid("0a6c9443-6062-5a62-8677-7f32789530ff"), "CLOTUREE", true, true, "Clôturée", 6, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("124847a1-86ab-5d2b-a72f-3c2896c1baf5"), "DRAFT", true, false, "Brouillon", 1, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("4447ab17-abd4-5fa3-8686-a730695820c6"), "OUVERTE", true, false, "Ouverte", 2, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("5c4b8ef9-9e47-5c8e-9455-2ee447a84c23"), "ASSIGNED", true, false, "Assignée", 3, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("b5e3f5fa-7fe9-5a4d-99e6-1ae2c8849870"), "EN_ANALYSE", true, false, "En analyse", 4, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("ec63beb7-8bd5-5223-a057-6c9d882a1a95"), "PENDING_VALIDATION", true, false, "En attente de validation", 5, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" }
                });

            migrationBuilder.InsertData(
                schema: "actionplan",
                table: "WorkflowTransitions",
                columns: new[] { "Id", "AllowedRoles", "FromCode", "IsActive", "ToCode", "UpdatedAt", "UpdatedBy", "WorkflowKey" },
                values: new object[,]
                {
                    { new Guid("3e260446-d203-54fe-9eed-65465a826286"), "user,admin,superadmin", "DRAFT", true, "OUVERTE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("46e1ca00-2ba1-5a5f-aff7-50bad42816bc"), "user,admin,superadmin", "ASSIGNED", true, "PENDING_VALIDATION", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("49a592f5-7451-551b-8efc-d9bd53c8d89a"), "admin,superadmin", "PENDING_VALIDATION", true, "EN_ANALYSE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("81959958-244c-548f-8ca6-8f08adaa9300"), "admin,superadmin", "PENDING_VALIDATION", true, "DRAFT", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("893aad5f-345a-53ed-8398-b86fe1743456"), "user,admin,superadmin", "OUVERTE", true, "PENDING_VALIDATION", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("99b87926-4b49-5705-a0a6-1acf5e5f8c91"), "admin,superadmin", "OUVERTE", true, "ASSIGNED", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("a19deeb1-f418-566b-94c3-812e87943405"), "admin,superadmin", "PENDING_VALIDATION", true, "CLOTUREE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("c21ed420-0a7c-55eb-97cc-5c7d6ac82c18"), "user,admin,superadmin", "OUVERTE", true, "EN_ANALYSE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("cafdafe8-a361-5107-9923-a90b923a8656"), "admin,superadmin", "ASSIGNED", true, "OUVERTE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("e64769d9-648b-5e02-ac7d-965d48041710"), "admin,superadmin", "PENDING_VALIDATION", true, "OUVERTE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("ecbba46d-3347-5a9c-a5f3-08e8b2d76c40"), "admin,superadmin", "CLOTUREE", true, "EN_ANALYSE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("f7b2a058-eaac-506f-ade8-8d6ca5d93ea4"), "user,admin,superadmin", "ASSIGNED", true, "EN_ANALYSE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("fc66e926-12fb-5910-8589-1aa9c613d804"), "user,admin,superadmin", "DRAFT", true, "PENDING_VALIDATION", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("fcfc676c-39cb-5d67-9332-d3818931f051"), "user,admin,superadmin", "EN_ANALYSE", true, "PENDING_VALIDATION", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActionDocuments_PlanActionId",
                schema: "actionplan",
                table: "ActionDocuments",
                column: "PlanActionId");

            migrationBuilder.CreateIndex(
                name: "IX_ActionPlanHistories_ActionPlanId",
                schema: "actionplan",
                table: "ActionPlanHistories",
                column: "ActionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_ActionPlanHistories_ActionPlanId1",
                schema: "actionplan",
                table: "ActionPlanHistories",
                column: "ActionPlanId1");

            migrationBuilder.CreateIndex(
                name: "IX_ActionPlans_AlertId",
                schema: "actionplan",
                table: "ActionPlans",
                column: "AlertId");

            migrationBuilder.CreateIndex(
                name: "IX_ActionPlans_DepartmentId",
                schema: "actionplan",
                table: "ActionPlans",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_ActionPlans_OrganizationId",
                schema: "actionplan",
                table: "ActionPlans",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_AlertAttachments_AlertId",
                schema: "actionplan",
                table: "AlertAttachments",
                column: "AlertId");

            migrationBuilder.CreateIndex(
                name: "IX_AlertComments_AlertId",
                schema: "actionplan",
                table: "AlertComments",
                column: "AlertId");

            migrationBuilder.CreateIndex(
                name: "IX_AlertReports_AlertId",
                schema: "actionplan",
                table: "AlertReports",
                column: "AlertId");

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_DepartmentId",
                schema: "actionplan",
                table: "Alerts",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_DetectedAt",
                schema: "actionplan",
                table: "Alerts",
                column: "DetectedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_Status",
                schema: "actionplan",
                table: "Alerts",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_Type_DefectType_ProductionLine_Status",
                schema: "actionplan",
                table: "Alerts",
                columns: new[] { "Type", "DefectType", "ProductionLine", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_AlertTimelineEvents_AlertId",
                schema: "actionplan",
                table: "AlertTimelineEvents",
                column: "AlertId");

            migrationBuilder.CreateIndex(
                name: "IX_AlertTimelineEvents_CreatedAt",
                schema: "actionplan",
                table: "AlertTimelineEvents",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Badges_EarnedAt",
                schema: "actionplan",
                table: "Badges",
                column: "EarnedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Badges_UserId",
                schema: "actionplan",
                table: "Badges",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Badges_UserId_Category",
                schema: "actionplan",
                table: "Badges",
                columns: new[] { "UserId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_Claims_AssignedToId",
                schema: "actionplan",
                table: "Claims",
                column: "AssignedToId");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_ClientId",
                schema: "actionplan",
                table: "Claims",
                column: "ClientId");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_CreatedAt_Id",
                schema: "actionplan",
                table: "Claims",
                columns: new[] { "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Claims_CreatedById",
                schema: "actionplan",
                table: "Claims",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_DefectType",
                schema: "actionplan",
                table: "Claims",
                column: "DefectType");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_DetectionDate",
                schema: "actionplan",
                table: "Claims",
                column: "DetectionDate");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_LotNumber",
                schema: "actionplan",
                table: "Claims",
                column: "LotNumber");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_StatusCode",
                schema: "actionplan",
                table: "Claims",
                column: "StatusCode");

            migrationBuilder.CreateIndex(
                name: "IX_Countries_OrganizationId",
                schema: "actionplan",
                table: "Countries",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Countries_RegionId",
                schema: "actionplan",
                table: "Countries",
                column: "RegionId");

            migrationBuilder.CreateIndex(
                name: "IX_D4Overrides_ClaimId",
                schema: "actionplan",
                table: "D4Overrides",
                column: "ClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_Departments_OrganizationId",
                schema: "actionplan",
                table: "Departments",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Departments_RegionId",
                schema: "actionplan",
                table: "Departments",
                column: "RegionId");

            migrationBuilder.CreateIndex(
                name: "IX_Departments_SiteId",
                schema: "actionplan",
                table: "Departments",
                column: "SiteId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentFavorites_DocumentId_UserId",
                schema: "actionplan",
                table: "DocumentFavorites",
                columns: new[] { "DocumentId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Documents_Category",
                schema: "actionplan",
                table: "Documents",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_EightDVersions_ClaimId",
                schema: "actionplan",
                table: "EightDVersions",
                column: "ClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_EightDVersions_DossierId_VersionNumber",
                schema: "actionplan",
                table: "EightDVersions",
                columns: new[] { "DossierId", "VersionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FiveWhyAnalyses_ClaimId",
                schema: "actionplan",
                table: "FiveWhyAnalyses",
                column: "ClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_FiveWhySteps_AnalysisId",
                schema: "actionplan",
                table: "FiveWhySteps",
                column: "AnalysisId");

            migrationBuilder.CreateIndex(
                name: "IX_Functions_DepartmentId",
                schema: "actionplan",
                table: "Functions",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportBatchClaims_ClaimId",
                schema: "actionplan",
                table: "ImportBatchClaims",
                column: "ClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_IshikawaCauses_ClaimId_Category",
                schema: "actionplan",
                table: "IshikawaCauses",
                columns: new[] { "ClaimId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_Licences_SiteId",
                schema: "actionplan",
                table: "Licences",
                column: "SiteId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_ActionPlanId",
                schema: "actionplan",
                table: "Notifications",
                column: "ActionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_RecipientId",
                schema: "actionplan",
                table: "Notifications",
                column: "RecipientId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_RecipientId_IsRead",
                schema: "actionplan",
                table: "Notifications",
                columns: new[] { "RecipientId", "IsRead" });

            migrationBuilder.CreateIndex(
                name: "IX_PlanActionAssignmentHistory_CreatedAt",
                schema: "actionplan",
                table: "PlanActionAssignmentHistory",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PlanActionAssignmentHistory_PlanActionId",
                schema: "actionplan",
                table: "PlanActionAssignmentHistory",
                column: "PlanActionId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanActionHistories_CreatedAt",
                schema: "actionplan",
                table: "PlanActionHistories",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PlanActionHistories_PlanActionId",
                schema: "actionplan",
                table: "PlanActionHistories",
                column: "PlanActionId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanActionHistories_PlanActionId1",
                schema: "actionplan",
                table: "PlanActionHistories",
                column: "PlanActionId1");

            migrationBuilder.CreateIndex(
                name: "IX_PlanActions_ActionPlanId",
                schema: "actionplan",
                table: "PlanActions",
                column: "ActionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_PriorityCauses_ClaimId_SelectedAt",
                schema: "actionplan",
                table: "PriorityCauses",
                columns: new[] { "ClaimId", "SelectedAt" });

            migrationBuilder.CreateIndex(
                name: "UX_PriorityCauses_Current",
                schema: "actionplan",
                table: "PriorityCauses",
                column: "ClaimId",
                unique: true,
                filter: "[IsCurrent] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_ReferenceItems_ListKey_Value",
                schema: "actionplan",
                table: "ReferenceItems",
                columns: new[] { "ListKey", "Value" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Regions_OrganizationId",
                schema: "actionplan",
                table: "Regions",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_SemanticEmbeddings_EntityType",
                schema: "actionplan",
                table: "SemanticEmbeddings",
                column: "EntityType");

            migrationBuilder.CreateIndex(
                name: "IX_SemanticEmbeddings_EntityType_EntityId",
                schema: "actionplan",
                table: "SemanticEmbeddings",
                columns: new[] { "EntityType", "EntityId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sites_CountryId",
                schema: "actionplan",
                table: "Sites",
                column: "CountryId");

            migrationBuilder.CreateIndex(
                name: "IX_Sites_OrganizationId",
                schema: "actionplan",
                table: "Sites",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEvents_Timestamp",
                schema: "actionplan",
                table: "TimelineEvents",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEvents_UserId",
                schema: "actionplan",
                table: "TimelineEvents",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEvents_UserId_Timestamp",
                schema: "actionplan",
                table: "TimelineEvents",
                columns: new[] { "UserId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_UserActionPlanAssignments_ActionPlanId",
                schema: "actionplan",
                table: "UserActionPlanAssignments",
                column: "ActionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_UserActionPlanAssignments_UserId_ActionPlanId",
                schema: "actionplan",
                table: "UserActionPlanAssignments",
                columns: new[] { "UserId", "ActionPlanId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserFunctions_FunctionId",
                schema: "actionplan",
                table: "UserFunctions",
                column: "FunctionId");

            migrationBuilder.CreateIndex(
                name: "IX_UserProfiles_DepartmentId",
                schema: "actionplan",
                table: "UserProfiles",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_UserProfiles_ManagerId",
                schema: "actionplan",
                table: "UserProfiles",
                column: "ManagerId");

            migrationBuilder.CreateIndex(
                name: "IX_UserProfiles_UserId",
                schema: "actionplan",
                table: "UserProfiles",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowStatuses_WorkflowKey_Code",
                schema: "actionplan",
                table: "WorkflowStatuses",
                columns: new[] { "WorkflowKey", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowTransitions_WorkflowKey_FromCode_ToCode",
                schema: "actionplan",
                table: "WorkflowTransitions",
                columns: new[] { "WorkflowKey", "FromCode", "ToCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActionDocuments",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "ActionPlanHistories",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "AlertAttachments",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "AlertComments",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "AlertReports",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "AlertTimelineEvents",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Badges",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "CalendarEvents",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Claims",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "D4Overrides",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "DocumentFavorites",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "EightDDossiers",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "EightDVersions",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "FiveWhySteps",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "ImportBatchClaims",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "ImportBatches",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "IshikawaAnalyses",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "IshikawaCauses",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Licences",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Modules",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Notifications",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "PlanActionAssignmentHistory",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "PlanActionHistories",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "PriorityCauses",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "ReferenceItems",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "SemanticEmbeddings",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "TimelineEvents",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "UserActionPlanAssignments",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "UserFunctions",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "UserProfiles",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "WorkflowStatuses",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "WorkflowTransitions",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Documents",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "FiveWhyAnalyses",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "PlanActions",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Functions",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "ActionPlans",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Alerts",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Departments",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Sites",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Countries",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Regions",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "Organizations",
                schema: "actionplan");
        }
    }
}
