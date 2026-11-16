using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlanApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApprovalComment",
                schema: "actionplan",
                table: "ActionPlans",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovalDecidedAt",
                schema: "actionplan",
                table: "ActionPlans",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovalDecidedById",
                schema: "actionplan",
                table: "ActionPlans",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ApprovalStatus",
                schema: "actionplan",
                table: "ActionPlans",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovalComment",
                schema: "actionplan",
                table: "ActionPlans");

            migrationBuilder.DropColumn(
                name: "ApprovalDecidedAt",
                schema: "actionplan",
                table: "ActionPlans");

            migrationBuilder.DropColumn(
                name: "ApprovalDecidedById",
                schema: "actionplan",
                table: "ActionPlans");

            migrationBuilder.DropColumn(
                name: "ApprovalStatus",
                schema: "actionplan",
                table: "ActionPlans");
        }
    }
}
