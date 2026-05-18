using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WbsItemParentCascade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WbsItems_WbsItems_ParentId",
                table: "WbsItems");

            migrationBuilder.AddForeignKey(
                name: "FK_WbsItems_WbsItems_ParentId",
                table: "WbsItems",
                column: "ParentId",
                principalTable: "WbsItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WbsItems_WbsItems_ParentId",
                table: "WbsItems");

            migrationBuilder.AddForeignKey(
                name: "FK_WbsItems_WbsItems_ParentId",
                table: "WbsItems",
                column: "ParentId",
                principalTable: "WbsItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
