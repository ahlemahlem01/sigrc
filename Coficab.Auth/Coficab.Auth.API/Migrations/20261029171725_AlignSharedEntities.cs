using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.Auth.API.Migrations
{
    /// <inheritdoc />
    public partial class AlignSharedEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NewDescription",
                schema: "app_auth",
                table: "PlanActionHistory",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OldDescription",
                schema: "app_auth",
                table: "PlanActionHistory",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DataJson",
                schema: "app_auth",
                table: "Notifications",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NewDescription",
                schema: "app_auth",
                table: "PlanActionHistory");

            migrationBuilder.DropColumn(
                name: "OldDescription",
                schema: "app_auth",
                table: "PlanActionHistory");

            migrationBuilder.DropColumn(
                name: "DataJson",
                schema: "app_auth",
                table: "Notifications");
        }
    }
}
