using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.Auth.API.Migrations
{
    /// <inheritdoc />
    public partial class AuthPlanApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApprovalComment",
                schema: "app_auth",
                table: "ActionPlan",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovalDecidedAt",
                schema: "app_auth",
                table: "ActionPlan",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovalDecidedById",
                schema: "app_auth",
                table: "ActionPlan",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ApprovalStatus",
                schema: "app_auth",
                table: "ActionPlan",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovalComment",
                schema: "app_auth",
                table: "ActionPlan");

            migrationBuilder.DropColumn(
                name: "ApprovalDecidedAt",
                schema: "app_auth",
                table: "ActionPlan");

            migrationBuilder.DropColumn(
                name: "ApprovalDecidedById",
                schema: "app_auth",
                table: "ActionPlan");

            migrationBuilder.DropColumn(
                name: "ApprovalStatus",
                schema: "app_auth",
                table: "ActionPlan");
        }
    }
}
