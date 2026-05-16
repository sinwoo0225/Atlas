using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1) 8 개 테이블에 CreatedBy/UpdatedBy 컬럼 추가 (모두 NOT NULL DEFAULT '').
            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "WorkLogs",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "WorkLogs",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "WbsItems",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "WbsItems",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "Resources",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "Resources",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "Projects",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "Projects",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "Meetings",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "Meetings",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "Issues",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "Issues",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "DevInfoItems",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "DevInfoItems",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "ChangeLogs",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "ChangeLogs",
                type: "TEXT",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            // 2) ChangeLogs 의 기존 Author 데이터를 CreatedBy 로 이동 — 컬럼 제거 직전.
            migrationBuilder.Sql(
                "UPDATE ChangeLogs SET CreatedBy = Author WHERE Author IS NOT NULL AND Author <> '';");

            // 3) Author 컬럼 제거 (SQLite 는 EF 8 이 내부적으로 table rebuild 로 처리).
            migrationBuilder.DropColumn(
                name: "Author",
                table: "ChangeLogs");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // 1) Author 컬럼 복구.
            migrationBuilder.AddColumn<string>(
                name: "Author",
                table: "ChangeLogs",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            // 2) CreatedBy 데이터를 Author 로 역이동.
            migrationBuilder.Sql(
                "UPDATE ChangeLogs SET Author = CreatedBy WHERE CreatedBy IS NOT NULL AND CreatedBy <> '';");

            // 3) 8 개 테이블의 CreatedBy/UpdatedBy 제거.
            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "WorkLogs");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "WorkLogs");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "WbsItems");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "WbsItems");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "Issues");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "Issues");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "DevInfoItems");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "DevInfoItems");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "ChangeLogs");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                table: "ChangeLogs");
        }
    }
}
