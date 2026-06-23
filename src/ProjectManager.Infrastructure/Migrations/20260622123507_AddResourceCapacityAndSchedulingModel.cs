using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddResourceCapacityAndSchedulingModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "EstimateHours",
                table: "WbsItems",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BillRate",
                table: "Resources",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CostRate",
                table: "Resources",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Resources",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Skills",
                table: "Resources",
                type: "TEXT",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "WeeklyCapacityHours",
                table: "Resources",
                type: "REAL",
                nullable: false,
                defaultValue: 40.0);

            migrationBuilder.CreateTable(
                name: "ResourceAvailabilities",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ResourceId = table.Column<int>(type: "INTEGER", nullable: false),
                    StartDate = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EndDate = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false, defaultValue: "PTO"),
                    Hours = table.Column<double>(type: "REAL", nullable: true),
                    Note = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false, defaultValue: ""),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResourceAvailabilities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ResourceAvailabilities_Resources_ResourceId",
                        column: x => x.ResourceId,
                        principalTable: "Resources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WbsAssignments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    WbsItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    ResourceId = table.Column<int>(type: "INTEGER", nullable: false),
                    AllocationPercent = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WbsAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WbsAssignments_Resources_ResourceId",
                        column: x => x.ResourceId,
                        principalTable: "Resources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WbsAssignments_WbsItems_WbsItemId",
                        column: x => x.WbsItemId,
                        principalTable: "WbsItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WbsDependencies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PredecessorId = table.Column<int>(type: "INTEGER", nullable: false),
                    SuccessorId = table.Column<int>(type: "INTEGER", nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false, defaultValue: "FinishToStart"),
                    LagDays = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WbsDependencies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WbsDependencies_WbsItems_PredecessorId",
                        column: x => x.PredecessorId,
                        principalTable: "WbsItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WbsDependencies_WbsItems_SuccessorId",
                        column: x => x.SuccessorId,
                        principalTable: "WbsItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ResourceAvailabilities_ResourceId_StartDate",
                table: "ResourceAvailabilities",
                columns: new[] { "ResourceId", "StartDate" });

            migrationBuilder.CreateIndex(
                name: "IX_WbsAssignments_ResourceId",
                table: "WbsAssignments",
                column: "ResourceId");

            migrationBuilder.CreateIndex(
                name: "IX_WbsAssignments_WbsItemId_ResourceId",
                table: "WbsAssignments",
                columns: new[] { "WbsItemId", "ResourceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WbsDependencies_PredecessorId_SuccessorId",
                table: "WbsDependencies",
                columns: new[] { "PredecessorId", "SuccessorId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WbsDependencies_SuccessorId",
                table: "WbsDependencies",
                column: "SuccessorId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ResourceAvailabilities");

            migrationBuilder.DropTable(
                name: "WbsAssignments");

            migrationBuilder.DropTable(
                name: "WbsDependencies");

            migrationBuilder.DropColumn(
                name: "EstimateHours",
                table: "WbsItems");

            migrationBuilder.DropColumn(
                name: "BillRate",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "CostRate",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "Skills",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "WeeklyCapacityHours",
                table: "Resources");
        }
    }
}
