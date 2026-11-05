using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coficab.ActionPlan.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PersonalDataAndModules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CinCountry",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CinDate",
                schema: "actionplan",
                table: "UserProfiles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CinNumber",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DateOfBirth",
                schema: "actionplan",
                table: "UserProfiles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FatherLastName",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FatherName",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MotherLastName",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MotherName",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Nationalities",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PassportCountry",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PassportNumber",
                schema: "actionplan",
                table: "UserProfiles",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PassportValidFrom",
                schema: "actionplan",
                table: "UserProfiles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PassportValidTill",
                schema: "actionplan",
                table: "UserProfiles",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CinCountry",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "CinDate",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "CinNumber",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "DateOfBirth",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "FatherLastName",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "FatherName",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "MotherLastName",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "MotherName",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "Nationalities",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "PassportCountry",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "PassportNumber",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "PassportValidFrom",
                schema: "actionplan",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "PassportValidTill",
                schema: "actionplan",
                table: "UserProfiles");
        }
    }
}
