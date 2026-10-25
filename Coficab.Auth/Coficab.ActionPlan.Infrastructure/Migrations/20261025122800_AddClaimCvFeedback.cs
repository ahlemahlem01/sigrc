using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClaimCvFeedback : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "CvConfidence",
                schema: "actionplan",
                table: "Claims",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "CvCorrectionLogged",
                schema: "actionplan",
                table: "Claims",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "CvPredictedDefectType",
                schema: "actionplan",
                table: "Claims",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CvConfidence",
                schema: "actionplan",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "CvCorrectionLogged",
                schema: "actionplan",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "CvPredictedDefectType",
                schema: "actionplan",
                table: "Claims");
        }
    }
}
