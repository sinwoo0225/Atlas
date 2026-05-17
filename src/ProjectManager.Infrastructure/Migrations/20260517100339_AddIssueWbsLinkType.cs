using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddIssueWbsLinkType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "IssueWbsLinks",
                type: "TEXT",
                maxLength: 32,
                nullable: false,
                defaultValue: "RelatesTo");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Type",
                table: "IssueWbsLinks");
        }
    }
}
