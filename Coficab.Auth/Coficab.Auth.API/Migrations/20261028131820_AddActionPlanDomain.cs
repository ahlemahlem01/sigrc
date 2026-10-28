using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.Auth.API.Migrations
{
    /// <inheritdoc />
    public partial class AddActionPlanDomain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Domain",
                schema: "app_auth",
                table: "ActionPlan",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Domain",
                schema: "app_auth",
                table: "ActionPlan");
        }
    }
}
