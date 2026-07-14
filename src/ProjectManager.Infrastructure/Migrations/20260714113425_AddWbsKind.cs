using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWbsKind : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "WbsItems",
                type: "TEXT",
                maxLength: 16,
                nullable: false,
                defaultValue: "Task");

            migrationBuilder.AddColumn<bool>(
                name: "AutoGroupParents",
                table: "Projects",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            // 기존 데이터 백필 — 도입 전의 암묵 규약('자식이 있는 항목 = 그루핑 노드 → 모든 지표에서 제외')을 Kind 로 고정한다.
            // 자식 보유 항목 → Group, 나머지는 AddColumn 의 defaultValue 로 이미 Task.
            // 이 한 줄이 "마이그레이션 전후 지표 숫자가 100% 동일" 을 보장한다 — 빼먹으면 모든 부모가 Task 가 되어
            // 완료율 분모·잔여·번업·용량이 한꺼번에 부풀어 오른다.
            // Kind 는 string 저장이라 'Group' (따옴표), Status 는 레거시 int ordinal 이라 숫자 — 혼동 주의.
            // 모든 진입점(Web/CLI/MCP) 과 백업 import(EnsureBackupSchemaAsync→MigrateAsync) 에 일괄 적용되도록 Up() 에 둔다
            // (AddCompletionDates 가 확립한 패턴).
            migrationBuilder.Sql(
                "UPDATE WbsItems SET Kind = 'Group' " +
                "WHERE Id IN (SELECT DISTINCT ParentId FROM WbsItems WHERE ParentId IS NOT NULL);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Kind",
                table: "WbsItems");

            migrationBuilder.DropColumn(
                name: "AutoGroupParents",
                table: "Projects");
        }
    }
}
