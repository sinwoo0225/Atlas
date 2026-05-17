using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameWbsOrderToImportanceAddSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 사이클 14 — Order 가 중요도(1/2/3) + 정렬순서 두 의미 혼재였음. 분리:
            //  - 기존 Order 값 (중요도) → Importance 로 rename (데이터 보존)
            //  - SortOrder 신규 컬럼 (default 0) — 시작 시 AppHostFactory 의 ROW_NUMBER backfill 로 startDate 기준 채움
            // EF auto 생성은 Order→SortOrder 로 잘못 매핑하므로 수동 정정.
            migrationBuilder.RenameColumn(
                name: "Order",
                table: "WbsItems",
                newName: "Importance");

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "WbsItems",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "WbsItems");

            migrationBuilder.RenameColumn(
                name: "Importance",
                table: "WbsItems",
                newName: "Order");
        }
    }
}
