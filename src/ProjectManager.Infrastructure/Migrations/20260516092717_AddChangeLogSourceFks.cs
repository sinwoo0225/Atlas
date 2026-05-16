using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChangeLogSourceFks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SourceIssueId",
                table: "ChangeLogs",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SourceWbsItemId",
                table: "ChangeLogs",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChangeLogs_SourceIssueId",
                table: "ChangeLogs",
                column: "SourceIssueId");

            migrationBuilder.CreateIndex(
                name: "IX_ChangeLogs_SourceWbsItemId",
                table: "ChangeLogs",
                column: "SourceWbsItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_ChangeLogs_Issues_SourceIssueId",
                table: "ChangeLogs",
                column: "SourceIssueId",
                principalTable: "Issues",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ChangeLogs_WbsItems_SourceWbsItemId",
                table: "ChangeLogs",
                column: "SourceWbsItemId",
                principalTable: "WbsItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ChangeLogs_Issues_SourceIssueId",
                table: "ChangeLogs");

            migrationBuilder.DropForeignKey(
                name: "FK_ChangeLogs_WbsItems_SourceWbsItemId",
                table: "ChangeLogs");

            migrationBuilder.DropIndex(
                name: "IX_ChangeLogs_SourceIssueId",
                table: "ChangeLogs");

            migrationBuilder.DropIndex(
                name: "IX_ChangeLogs_SourceWbsItemId",
                table: "ChangeLogs");

            migrationBuilder.DropColumn(
                name: "SourceIssueId",
                table: "ChangeLogs");

            migrationBuilder.DropColumn(
                name: "SourceWbsItemId",
                table: "ChangeLogs");
        }
    }
}
