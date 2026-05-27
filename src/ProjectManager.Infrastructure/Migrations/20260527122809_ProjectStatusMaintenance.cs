using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProjectStatusMaintenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 스키마 변경 없음(Status 는 int 서수 유지). 데이터 정규화만 수행.
            // 1) '계획'(Planned=0) → '대기/보류'(Waiting=1) 통합.
            migrationBuilder.Sql("UPDATE Projects SET Status = 1 WHERE Status = 0;");
            // 2) 구분 '유지보수/하자보수' → 상태 Maintenance(=4) 로 승격하고 해당 구분 비움.
            migrationBuilder.Sql("UPDATE Projects SET Status = 4, Category = '' WHERE Category = '유지보수/하자보수';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // 데이터 통합(계획→대기/보류, 구분→상태)은 비가역이므로 되돌리지 않음.
        }
    }
}
