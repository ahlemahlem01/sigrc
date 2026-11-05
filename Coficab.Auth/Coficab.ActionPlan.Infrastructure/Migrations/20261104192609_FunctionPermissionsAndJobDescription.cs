using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FunctionPermissionsAndJobDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "JobDescriptionFileName",
                schema: "actionplan",
                table: "Functions",
                type: "nvarchar(260)",
                maxLength: 260,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Permissions",
                schema: "actionplan",
                table: "Functions",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "JobDescriptionFileName",
                schema: "actionplan",
                table: "Functions");

            migrationBuilder.DropColumn(
                name: "Permissions",
                schema: "actionplan",
                table: "Functions");
        }
    }
}
