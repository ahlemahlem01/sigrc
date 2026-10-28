using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClaimCvValidation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CvValidatedAt",
                schema: "actionplan",
                table: "Claims",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CvValidatedById",
                schema: "actionplan",
                table: "Claims",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CvValidatedDefectType",
                schema: "actionplan",
                table: "Claims",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CvValidationStatus",
                schema: "actionplan",
                table: "Claims",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CvValidatedAt",
                schema: "actionplan",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "CvValidatedById",
                schema: "actionplan",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "CvValidatedDefectType",
                schema: "actionplan",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "CvValidationStatus",
                schema: "actionplan",
                table: "Claims");
        }
    }
}
