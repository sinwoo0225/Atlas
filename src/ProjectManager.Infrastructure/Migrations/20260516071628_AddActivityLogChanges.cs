using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddActivityLogChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ChangesJson",
                table: "ActivityLogs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ActivityLogs_Timestamp",
                table: "ActivityLogs",
                column: "Timestamp");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ActivityLogs_Timestamp",
                table: "ActivityLogs");

            migrationBuilder.DropColumn(
                name: "ChangesJson",
                table: "ActivityLogs");
        }
    }
}
