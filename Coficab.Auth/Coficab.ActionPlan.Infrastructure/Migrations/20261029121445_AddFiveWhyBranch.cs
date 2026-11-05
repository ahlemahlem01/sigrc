using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFiveWhyBranch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BranchType",
                schema: "actionplan",
                table: "FiveWhySteps",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "OCCURRENCE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BranchType",
                schema: "actionplan",
                table: "FiveWhySteps");
        }
    }
}
