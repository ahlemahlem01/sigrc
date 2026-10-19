using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserAliases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserAliases",
                schema: "actionplan",
                columns: table => new
                {
                    OldUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    MergedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    MergedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserAliases", x => x.OldUserId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserAliases_UserId",
                schema: "actionplan",
                table: "UserAliases",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserAliases",
                schema: "actionplan");
        }
    }
}
