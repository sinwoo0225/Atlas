using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectManager.Infrastructure.Migrations
{
    // search_index 는 FTS5 가상 테이블 — EF 의 일반 엔티티가 아니므로
    // 모델 스냅샷(AppDbContextModelSnapshot.cs)을 건드리지 않는다.
    // 인덱스 행은 SearchSaveChangesInterceptor 가 SaveChanges 이후 채운다.
    public partial class AddSearchIndex : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // tokenize='trigram' — 한국어/CJK 부분 일치를 위해. SQLite 3.34+ 필요 (EF Sqlite 8.0.16 동봉본은 만족).
            // entity_type / entity_id / project_id / updated_at 은 검색 색인 대상이 아니므로 UNINDEXED.
            // title 과 body 만 FTS 토큰 인덱스 대상.
            migrationBuilder.Sql(@"
                CREATE VIRTUAL TABLE search_index USING fts5(
                    entity_type UNINDEXED,
                    entity_id UNINDEXED,
                    project_id UNINDEXED,
                    title,
                    body,
                    updated_at UNINDEXED,
                    tokenize='trigram'
                );
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TABLE IF EXISTS search_index;");
        }
    }
}
