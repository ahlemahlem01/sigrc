using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLegacyClaimStatuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                schema: "actionplan",
                table: "WorkflowStatuses",
                columns: new[] { "Id", "Code", "IsActive", "IsFinal", "Label", "SortOrder", "UpdatedAt", "UpdatedBy", "WorkflowKey" },
                values: new object[,]
                {
                    { new Guid("1bdc033b-895c-550c-a865-fa3b6b47cac9"), "VALIDATED", true, false, "Validée", 7, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("e4c8d374-d934-58e3-927d-6288f7faa1e4"), "REJECTED", true, false, "Rejetée", 8, new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" }
                });

            migrationBuilder.InsertData(
                schema: "actionplan",
                table: "WorkflowTransitions",
                columns: new[] { "Id", "AllowedRoles", "FromCode", "IsActive", "ToCode", "UpdatedAt", "UpdatedBy", "WorkflowKey" },
                values: new object[,]
                {
                    { new Guid("41c20e8a-6e6a-526e-93e7-4bc23bdcd1d6"), "user,admin,superadmin", "REJECTED", true, "EN_ANALYSE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("5604ff62-a2f0-5e1d-9428-ca8b1c6bf310"), "user,admin,superadmin", "VALIDATED", true, "EN_ANALYSE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("5d583d3e-99ac-5ea5-b59e-eeb0f6ac348a"), "user,admin,superadmin", "REJECTED", true, "OUVERTE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" },
                    { new Guid("b0055ee5-8cd3-57c6-b034-4b6a592fe8e3"), "user,admin,superadmin", "VALIDATED", true, "CLOTUREE", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "claim" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                schema: "actionplan",
                table: "WorkflowStatuses",
                keyColumn: "Id",
                keyValue: new Guid("1bdc033b-895c-550c-a865-fa3b6b47cac9"));

            migrationBuilder.DeleteData(
                schema: "actionplan",
                table: "WorkflowStatuses",
                keyColumn: "Id",
                keyValue: new Guid("e4c8d374-d934-58e3-927d-6288f7faa1e4"));

            migrationBuilder.DeleteData(
                schema: "actionplan",
                table: "WorkflowTransitions",
                keyColumn: "Id",
                keyValue: new Guid("41c20e8a-6e6a-526e-93e7-4bc23bdcd1d6"));

            migrationBuilder.DeleteData(
                schema: "actionplan",
                table: "WorkflowTransitions",
                keyColumn: "Id",
                keyValue: new Guid("5604ff62-a2f0-5e1d-9428-ca8b1c6bf310"));

            migrationBuilder.DeleteData(
                schema: "actionplan",
                table: "WorkflowTransitions",
                keyColumn: "Id",
                keyValue: new Guid("5d583d3e-99ac-5ea5-b59e-eeb0f6ac348a"));

            migrationBuilder.DeleteData(
                schema: "actionplan",
                table: "WorkflowTransitions",
                keyColumn: "Id",
                keyValue: new Guid("b0055ee5-8cd3-57c6-b034-4b6a592fe8e3"));
        }
    }
}
