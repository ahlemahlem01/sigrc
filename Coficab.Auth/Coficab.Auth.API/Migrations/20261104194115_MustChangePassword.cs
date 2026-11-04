using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.Auth.API.Migrations
{
    /// <inheritdoc />
    public partial class MustChangePassword : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "JobDescriptionFileName",
                schema: "app_auth",
                table: "Function",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Permissions",
                schema: "app_auth",
                table: "Function",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MustChangePassword",
                schema: "app_auth",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "JobDescriptionFileName",
                schema: "app_auth",
                table: "Function");

            migrationBuilder.DropColumn(
                name: "Permissions",
                schema: "app_auth",
                table: "Function");

            migrationBuilder.DropColumn(
                name: "MustChangePassword",
                schema: "app_auth",
                table: "AspNetUsers");
        }
    }
}
