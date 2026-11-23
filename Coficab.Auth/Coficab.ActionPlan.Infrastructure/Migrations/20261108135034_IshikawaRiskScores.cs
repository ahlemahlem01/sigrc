using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class IshikawaRiskScores : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "RiskDetection",
                schema: "actionplan",
                table: "IshikawaCauses",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RiskOccurrence",
                schema: "actionplan",
                table: "IshikawaCauses",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RiskSeverity",
                schema: "actionplan",
                table: "IshikawaCauses",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RiskDetection",
                schema: "actionplan",
                table: "IshikawaCauses");

            migrationBuilder.DropColumn(
                name: "RiskOccurrence",
                schema: "actionplan",
                table: "IshikawaCauses");

            migrationBuilder.DropColumn(
                name: "RiskSeverity",
                schema: "actionplan",
                table: "IshikawaCauses");
        }
    }
}
