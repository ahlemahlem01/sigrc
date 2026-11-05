using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EditableReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UpdateNote",
                schema: "actionplan",
                table: "SavedReports",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                schema: "actionplan",
                table: "SavedReports",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                schema: "actionplan",
                table: "SavedReports",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedByName",
                schema: "actionplan",
                table: "SavedReports",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                schema: "actionplan",
                table: "SavedReports",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "EightDReportVersions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false),
                    ModelJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SavedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SavedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SavedByName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EightDReportVersions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SavedReportVersions",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CriteriaJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ResultJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ItemCount = table.Column<int>(type: "int", nullable: false),
                    SavedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SavedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SavedByName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedReportVersions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EightDReportVersions_ClaimId_VersionNumber",
                schema: "actionplan",
                table: "EightDReportVersions",
                columns: new[] { "ClaimId", "VersionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SavedReportVersions_SavedReportId_VersionNumber",
                schema: "actionplan",
                table: "SavedReportVersions",
                columns: new[] { "SavedReportId", "VersionNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EightDReportVersions",
                schema: "actionplan");

            migrationBuilder.DropTable(
                name: "SavedReportVersions",
                schema: "actionplan");

            migrationBuilder.DropColumn(
                name: "UpdateNote",
                schema: "actionplan",
                table: "SavedReports");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                schema: "actionplan",
                table: "SavedReports");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                schema: "actionplan",
                table: "SavedReports");

            migrationBuilder.DropColumn(
                name: "UpdatedByName",
                schema: "actionplan",
                table: "SavedReports");

            migrationBuilder.DropColumn(
                name: "Version",
                schema: "actionplan",
                table: "SavedReports");
        }
    }
}
