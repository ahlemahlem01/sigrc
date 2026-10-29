using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlanActionDescriptionHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NewDescription",
                schema: "actionplan",
                table: "PlanActionHistories",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OldDescription",
                schema: "actionplan",
                table: "PlanActionHistories",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NewDescription",
                schema: "actionplan",
                table: "PlanActionHistories");

            migrationBuilder.DropColumn(
                name: "OldDescription",
                schema: "actionplan",
                table: "PlanActionHistories");
        }
    }
}
