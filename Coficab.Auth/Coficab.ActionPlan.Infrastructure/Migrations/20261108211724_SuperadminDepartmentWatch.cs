using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SuperadminDepartmentWatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SuperadminDepartmentWatches",
                schema: "actionplan",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SuperadminDepartmentWatches", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SuperadminDepartmentWatches_DepartmentId",
                schema: "actionplan",
                table: "SuperadminDepartmentWatches",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_SuperadminDepartmentWatches_UserId_DepartmentId",
                schema: "actionplan",
                table: "SuperadminDepartmentWatches",
                columns: new[] { "UserId", "DepartmentId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SuperadminDepartmentWatches",
                schema: "actionplan");
        }
    }
}
