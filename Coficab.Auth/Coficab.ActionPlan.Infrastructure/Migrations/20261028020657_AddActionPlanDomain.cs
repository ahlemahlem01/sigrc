using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddActionPlanDomain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Domain",
                schema: "actionplan",
                table: "ActionPlans",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "QUALITY");

            migrationBuilder.CreateIndex(
                name: "IX_ActionPlans_Domain",
                schema: "actionplan",
                table: "ActionPlans",
                column: "Domain");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ActionPlans_Domain",
                schema: "actionplan",
                table: "ActionPlans");

            migrationBuilder.DropColumn(
                name: "Domain",
                schema: "actionplan",
                table: "ActionPlans");
        }
    }
}
