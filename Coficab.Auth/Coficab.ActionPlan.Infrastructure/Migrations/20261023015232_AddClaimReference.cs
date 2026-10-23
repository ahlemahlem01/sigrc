using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClaimReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Reference",
                schema: "actionplan",
                table: "Claims",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Claims_Reference",
                schema: "actionplan",
                table: "Claims",
                column: "Reference",
                unique: true,
                filter: "[Reference] IS NOT NULL");

            // Existing claims get their reference in order of creation (archived ones included: a number is never reused).
            migrationBuilder.Sql(@"
UPDATE c SET c.Reference = 'REC-' + CAST(YEAR(c.CreatedAt) AS varchar(4)) + '-' +
    CASE WHEN n.rn < 10000 THEN RIGHT('0000' + CAST(n.rn AS varchar(10)), 4) ELSE CAST(n.rn AS varchar(10)) END
FROM [actionplan].[Claims] c
JOIN (SELECT Id, ROW_NUMBER() OVER (PARTITION BY YEAR(CreatedAt) ORDER BY CreatedAt, Id) AS rn
      FROM [actionplan].[Claims]) n ON n.Id = c.Id
WHERE c.Reference IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Claims_Reference",
                schema: "actionplan",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "Reference",
                schema: "actionplan",
                table: "Claims");
        }
    }
}
