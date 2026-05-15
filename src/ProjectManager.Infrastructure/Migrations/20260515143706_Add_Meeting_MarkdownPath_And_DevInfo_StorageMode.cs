using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Add_Meeting_MarkdownPath_And_DevInfo_StorageMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MarkdownPath",
                table: "Meetings",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StorageMode",
                table: "DevInfoItems",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MarkdownPath",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "StorageMode",
                table: "DevInfoItems");
        }
    }
}
