using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlanReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Reference",
                schema: "actionplan",
                table: "ActionPlans",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ActionPlans_Reference",
                schema: "actionplan",
                table: "ActionPlans",
                column: "Reference",
                unique: true,
                filter: "[Reference] IS NOT NULL");

            // Existing plans get their reference in order of creation (archived ones included: a number is never reused).
            migrationBuilder.Sql(@"
UPDATE p SET p.Reference =
    CASE p.[Type] WHEN 2 THEN 'PAC' WHEN 3 THEN 'PAP' ELSE 'PA' END + '-' + CAST(YEAR(p.CreatedAt) AS varchar(4)) + '-' +
    CASE WHEN n.rn < 10000 THEN RIGHT('0000' + CAST(n.rn AS varchar(10)), 4) ELSE CAST(n.rn AS varchar(10)) END
FROM [actionplan].[ActionPlans] p
JOIN (SELECT Id, ROW_NUMBER() OVER (PARTITION BY CASE [Type] WHEN 2 THEN 2 WHEN 3 THEN 3 ELSE 1 END, YEAR(CreatedAt) ORDER BY CreatedAt, Id) AS rn
      FROM [actionplan].[ActionPlans]) n ON n.Id = p.Id
WHERE p.Reference IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ActionPlans_Reference",
                schema: "actionplan",
                table: "ActionPlans");

            migrationBuilder.DropColumn(
                name: "Reference",
                schema: "actionplan",
                table: "ActionPlans");
        }
    }
}
