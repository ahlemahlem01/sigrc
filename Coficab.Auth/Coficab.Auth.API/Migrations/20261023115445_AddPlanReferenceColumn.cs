using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.Auth.API.Migrations
{
    /// <inheritdoc />
    public partial class AddPlanReferenceColumn : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Reference",
                schema: "app_auth",
                table: "ActionPlan",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Reference",
                schema: "app_auth",
                table: "ActionPlan");
        }
    }
}
