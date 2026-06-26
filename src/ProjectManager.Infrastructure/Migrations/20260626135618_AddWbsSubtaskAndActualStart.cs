using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWbsSubtaskAndActualStart : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ActualStartDate",
                table: "WbsItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WbsSubtasks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    WbsItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    IsDone = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WbsSubtasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WbsSubtasks_WbsItems_WbsItemId",
                        column: x => x.WbsItemId,
                        principalTable: "WbsItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WbsItems_ActualStartDate",
                table: "WbsItems",
                column: "ActualStartDate");

            migrationBuilder.CreateIndex(
                name: "IX_WbsSubtasks_WbsItemId",
                table: "WbsSubtasks",
                column: "WbsItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WbsSubtasks");

            migrationBuilder.DropIndex(
                name: "IX_WbsItems_ActualStartDate",
                table: "WbsItems");

            migrationBuilder.DropColumn(
                name: "ActualStartDate",
                table: "WbsItems");
        }
    }
}
