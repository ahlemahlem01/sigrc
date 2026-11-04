using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class QrqcInternalClaims : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsInternal",
                schema: "actionplan",
                table: "Claims",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsInternal",
                schema: "actionplan",
                table: "Claims");
        }
    }
}
