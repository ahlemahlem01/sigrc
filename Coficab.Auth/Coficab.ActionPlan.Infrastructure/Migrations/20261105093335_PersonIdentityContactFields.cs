using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PersonIdentityContactFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AdditionalEmails",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastName",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Site",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdditionalEmails",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "FirstName",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "LastName",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "Site",
                schema: "actionplan",
                table: "UserProfiles");
        }
    }
}
