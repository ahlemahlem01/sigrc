using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.Auth.API.Migrations
{
    /// <inheritdoc />
    public partial class MakeSiteCountryOptional : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Site_Country_CountryId",
                schema: "app_auth",
                table: "Site");

            migrationBuilder.DropForeignKey(
                name: "FK_Site_Organization_OrganizationId",
                schema: "app_auth",
                table: "Site");

            migrationBuilder.AlterColumn<Guid>(
                name: "CountryId",
                schema: "app_auth",
                table: "Site",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddForeignKey(
                name: "FK_Site_Country_CountryId",
                schema: "app_auth",
                table: "Site",
                column: "CountryId",
                principalSchema: "app_auth",
                principalTable: "Country",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Site_Organization_OrganizationId",
                schema: "app_auth",
                table: "Site",
                column: "OrganizationId",
                principalSchema: "app_auth",
                principalTable: "Organization",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Site_Country_CountryId",
                schema: "app_auth",
                table: "Site");

            migrationBuilder.DropForeignKey(
                name: "FK_Site_Organization_OrganizationId",
                schema: "app_auth",
                table: "Site");

            migrationBuilder.AlterColumn<Guid>(
                name: "CountryId",
                schema: "app_auth",
                table: "Site",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Site_Country_CountryId",
                schema: "app_auth",
                table: "Site",
                column: "CountryId",
                principalSchema: "app_auth",
                principalTable: "Country",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Site_Organization_OrganizationId",
                schema: "app_auth",
                table: "Site",
                column: "OrganizationId",
                principalSchema: "app_auth",
                principalTable: "Organization",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
