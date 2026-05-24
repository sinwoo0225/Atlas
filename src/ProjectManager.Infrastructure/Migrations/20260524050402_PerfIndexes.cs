using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PerfIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_WbsItems_EndDate",
                table: "WbsItems",
                column: "EndDate");

            migrationBuilder.CreateIndex(
                name: "IX_WbsItems_IsMilestone",
                table: "WbsItems",
                column: "IsMilestone");

            migrationBuilder.CreateIndex(
                name: "IX_Issues_DueDate",
                table: "Issues",
                column: "DueDate");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WbsItems_EndDate",
                table: "WbsItems");

            migrationBuilder.DropIndex(
                name: "IX_WbsItems_IsMilestone",
                table: "WbsItems");

            migrationBuilder.DropIndex(
                name: "IX_Issues_DueDate",
                table: "Issues");
        }
    }
}
