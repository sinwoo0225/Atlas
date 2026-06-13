using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCompletionDates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedDate",
                table: "WbsItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedDate",
                table: "Projects",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ResolvedDate",
                table: "Issues",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WbsItems_CompletedDate",
                table: "WbsItems",
                column: "CompletedDate");

            migrationBuilder.CreateIndex(
                name: "IX_Issues_ResolvedDate",
                table: "Issues",
                column: "ResolvedDate");

            // 기존 완료 항목 백필 — UpdatedAt 을 완료 시점 프록시로 사용(모니터링이 이미 쓰는 근사).
            // Status 는 정수 ordinal 저장: WbsStatus.Done=2, IssueStatus.Resolved=2/Closed=3, ProjectStatus.Done=3.
            // 모든 진입점(Web/CLI/MCP)과 백업 import(EnsureBackupSchemaAsync→MigrateAsync)에서 일괄 적용되도록 Up() 에 둔다.
            migrationBuilder.Sql("UPDATE WbsItems SET CompletedDate = UpdatedAt WHERE Status = 2 AND CompletedDate IS NULL;");
            migrationBuilder.Sql("UPDATE Issues   SET ResolvedDate  = UpdatedAt WHERE Status IN (2, 3) AND ResolvedDate IS NULL;");
            migrationBuilder.Sql("UPDATE Projects SET CompletedDate = UpdatedAt WHERE Status = 3 AND CompletedDate IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WbsItems_CompletedDate",
                table: "WbsItems");

            migrationBuilder.DropIndex(
                name: "IX_Issues_ResolvedDate",
                table: "Issues");

            migrationBuilder.DropColumn(
                name: "CompletedDate",
                table: "WbsItems");

            migrationBuilder.DropColumn(
                name: "CompletedDate",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ResolvedDate",
                table: "Issues");
        }
    }
}
