using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WbsDevInfoLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WbsDevInfoLinks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    WbsItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    DevInfoItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WbsDevInfoLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WbsDevInfoLinks_DevInfoItems_DevInfoItemId",
                        column: x => x.DevInfoItemId,
                        principalTable: "DevInfoItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WbsDevInfoLinks_WbsItems_WbsItemId",
                        column: x => x.WbsItemId,
                        principalTable: "WbsItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WbsDevInfoLinks_DevInfoItemId",
                table: "WbsDevInfoLinks",
                column: "DevInfoItemId");

            migrationBuilder.CreateIndex(
                name: "IX_WbsDevInfoLinks_WbsItemId_DevInfoItemId",
                table: "WbsDevInfoLinks",
                columns: new[] { "WbsItemId", "DevInfoItemId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WbsDevInfoLinks");
        }
    }
}
