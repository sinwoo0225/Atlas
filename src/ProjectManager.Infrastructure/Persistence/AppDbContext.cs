using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

// IActorAccessor 는 옵셔널 — dotnet ef 디자인타임 호출에서는 DI 컨테이너가 없어 null 로 들어오는데,
// ApplyAudit 가 그 케이스를 안전하게 다룬다.
public class AppDbContext(
    DbContextOptions<AppDbContext> options,
    IActorAccessor? actorAccessor = null) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<WbsItem> WbsItems => Set<WbsItem>();
    public DbSet<WbsVersion> WbsVersions => Set<WbsVersion>();
    public DbSet<WbsTemplate> WbsTemplates => Set<WbsTemplate>();
    public DbSet<ChangeLog> ChangeLogs => Set<ChangeLog>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<DevInfoItem> DevInfoItems => Set<DevInfoItem>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<Issue> Issues => Set<Issue>();
    public DbSet<IssueWbsLink> IssueWbsLinks => Set<IssueWbsLink>();
    public DbSet<WbsDevInfoLink> WbsDevInfoLinks => Set<WbsDevInfoLink>();
    public DbSet<WorkLog> WorkLogs => Set<WorkLog>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<TodoItem> TodoItems => Set<TodoItem>();
    public DbSet<WbsAssignment> WbsAssignments => Set<WbsAssignment>();
    public DbSet<ResourceAvailability> ResourceAvailabilities => Set<ResourceAvailability>();
    public DbSet<WbsDependency> WbsDependencies => Set<WbsDependency>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Project>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
            e.Property(x => x.Category).HasMaxLength(32).HasDefaultValue("");
            e.Property(x => x.GitRepoPath).HasMaxLength(500).HasDefaultValue("");
            e.Property(x => x.IssueCustomColumnsJson).HasColumnType("TEXT").HasDefaultValue("");
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.HasMany(x => x.WbsItems).WithOne(x => x.Project).HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.WbsVersions).WithOne(x => x.Project).HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.ChangeLogs).WithOne(x => x.Project).HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Meetings).WithOne(x => x.Project).HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.DevInfoItems).WithOne(x => x.Project).HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WbsItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(300);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            // ParentId 셀프 참조: Cascade — 부모 WBS 삭제 시 자식 트리 전부 함께 삭제.
            // Project cascade-delete 시 SQLite 가 부모/자식 순서 무관하게 처리할 수 있어야 Project 삭제가 성공한다 (Restrict 면 FK 위반).
            e.HasOne(x => x.Parent).WithMany(x => x.Children).HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Version).WithMany(x => x.WbsItems).HasForeignKey(x => x.VersionId).OnDelete(DeleteBehavior.SetNull);
            // 모니터링 집계가 EndDate 범위·마일스톤으로 across-project 스캔 (MonitoringService 히트맵/차트) → 데이터 多 시 인덱스.
            e.HasIndex(x => x.EndDate);
            e.HasIndex(x => x.IsMilestone);
            // 회고 번업·지연 집계가 CompletedDate 로 across-project 스캔 → 인덱스.
            e.HasIndex(x => x.CompletedDate);
        });

        modelBuilder.Entity<WbsTemplate>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
            e.Property(x => x.Category).HasMaxLength(64).HasDefaultValue("");
            // 작업 트리 직렬화 — JSON-in-TEXT (ActivityLog.ChangesJson 관례).
            e.Property(x => x.NodesJson).HasColumnType("TEXT");
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
        });

        modelBuilder.Entity<ChangeLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Content).IsRequired();
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            // 출처 FK 둘 다 SetNull — 원본 Issue/WBS 삭제 시 ChangeLog 본체는 감사 자료로 보존.
            e.HasOne(x => x.SourceIssue).WithMany().HasForeignKey(x => x.SourceIssueId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.SourceWbsItem).WithMany().HasForeignKey(x => x.SourceWbsItemId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.SourceIssueId);
            e.HasIndex(x => x.SourceWbsItemId);
        });

        modelBuilder.Entity<Meeting>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Topic).IsRequired().HasMaxLength(300);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            // 내부/외부 구분은 string 으로 — enum 순서 변경에 안전, SQL 가독성. default Internal 로 기존 행 마이그레이션.
            e.Property(x => x.Category).HasConversion<string>().HasMaxLength(16).HasDefaultValue(MeetingCategory.Internal);
        });

        modelBuilder.Entity<DevInfoItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(300);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
        });

        modelBuilder.Entity<Resource>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            // 용량 계획 필드 — 기존 행은 기본 40h/활성으로 마이그레이션. Skills 는 콤마 태그(부분일치 필터).
            e.Property(x => x.WeeklyCapacityHours).HasDefaultValue(40d);
            e.Property(x => x.Skills).HasMaxLength(500).HasDefaultValue("");
            e.Property(x => x.IsActive).HasDefaultValue(true);
        });

        modelBuilder.Entity<ResourceAvailability>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.Property(x => x.Note).HasMaxLength(300).HasDefaultValue("");
            // 사유는 string 저장 — enum 순서 변경 안전(Meeting.Category 관례).
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(16).HasDefaultValue(AvailabilityType.PTO);
            e.HasOne(x => x.Resource).WithMany().HasForeignKey(x => x.ResourceId).OnDelete(DeleteBehavior.Cascade);
            // 자원별 기간 조회(용량 차감)에 인덱스.
            e.HasIndex(x => new { x.ResourceId, x.StartDate });
        });

        modelBuilder.Entity<WbsAssignment>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.HasOne(x => x.WbsItem).WithMany(w => w.Assignments).HasForeignKey(x => x.WbsItemId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Resource).WithMany().HasForeignKey(x => x.ResourceId).OnDelete(DeleteBehavior.Cascade);
            // 중복 배정 방지 + by-wbs(선두 컬럼) 조회 커버. by-resource 는 별도 인덱스(후행 컬럼이라 미커버).
            e.HasIndex(x => new { x.WbsItemId, x.ResourceId }).IsUnique();
            e.HasIndex(x => x.ResourceId);
        });

        modelBuilder.Entity<WbsDependency>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(16).HasDefaultValue(WbsDependencyType.FinishToStart);
            // 같은 WbsItems 테이블로 가는 FK 2개 — 양쪽 Cascade. SQLite(EF Core)는 다중 cascade 경로를 허용하므로
            // 작업 삭제 시 어느 쪽 엣지든 함께 삭제되고, Project cascade-delete 의 순서 문제도 피한다(WbsItem.Parent 자기참조 Cascade 와 동일 전제).
            // 마이그레이션 추가 직후 프로젝트 생성→삭제로 정상 동작 확인할 것.
            e.HasOne(x => x.Predecessor).WithMany().HasForeignKey(x => x.PredecessorId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Successor).WithMany().HasForeignKey(x => x.SuccessorId).OnDelete(DeleteBehavior.Cascade);
            // 중복 의존성 방지 + by-predecessor(선두) 조회 커버. by-successor 는 별도 인덱스.
            e.HasIndex(x => new { x.PredecessorId, x.SuccessorId }).IsUnique();
            e.HasIndex(x => x.SuccessorId);
        });

        modelBuilder.Entity<Issue>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(300);
            e.Property(x => x.Category).HasMaxLength(64).HasDefaultValue("");
            e.Property(x => x.CustomFieldsJson).HasColumnType("TEXT").HasDefaultValue("");
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.HasOne(x => x.Project).WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.AssigneeResource).WithMany().HasForeignKey(x => x.AssigneeResourceId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.ProjectId);
            e.HasIndex(x => x.AssigneeResourceId);
            // 히트맵·모니터링이 DueDate 범위로 across-project 필터 (MonitoringService) → 데이터 多 시 인덱스.
            e.HasIndex(x => x.DueDate);
            // 회고 해결 소요·지연 집계가 ResolvedDate 로 across-project 스캔 → 인덱스.
            e.HasIndex(x => x.ResolvedDate);
        });

        modelBuilder.Entity<IssueWbsLink>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            // 관계 타입은 string 으로 — enum 순서가 바뀌어도 안전, 사람이 SQL 봐도 식별 가능.
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(32).HasDefaultValue(IssueWbsLinkType.RelatesTo);
            e.HasOne(x => x.Issue).WithMany().HasForeignKey(x => x.IssueId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.WbsItem).WithMany().HasForeignKey(x => x.WbsItemId).OnDelete(DeleteBehavior.Cascade);
            // 중복 링크 방지 + by-issue / by-wbs 조회 모두 인덱스 활용.
            // 복합 unique 의 선두 컬럼이 IssueId 라 by-issue 조회(IssuesPage by-project 의 묵시 조인 포함)는
            // 이 인덱스로 커버된다 → IssueId 단독 인덱스 불필요. WbsItemId 는 별도(후행 컬럼이라 미커버).
            e.HasIndex(x => new { x.IssueId, x.WbsItemId }).IsUnique();
            e.HasIndex(x => x.WbsItemId);
        });

        modelBuilder.Entity<WbsDevInfoLink>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.HasOne(x => x.WbsItem).WithMany().HasForeignKey(x => x.WbsItemId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.DevInfoItem).WithMany().HasForeignKey(x => x.DevInfoItemId).OnDelete(DeleteBehavior.Cascade);
            // 복합 unique 의 선두 컬럼 WbsItemId 가 by-wbs 조회를 커버 → WbsItemId 단독 인덱스 불필요. DevInfoItemId 는 별도.
            e.HasIndex(x => new { x.WbsItemId, x.DevInfoItemId }).IsUnique();
            e.HasIndex(x => x.DevInfoItemId);
        });

        modelBuilder.Entity<WorkLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.HasOne(x => x.Project).WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.ProjectId, x.Date }).IsUnique();
        });

        modelBuilder.Entity<ActivityLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.EntityType).IsRequired().HasMaxLength(50);
            e.Property(x => x.EntityTitle).HasMaxLength(300);
            e.Property(x => x.Actor).HasMaxLength(200);
            // ChangesJson 은 TEXT (nullable). Update 의 필드 diff 만 채워짐.
            e.Property(x => x.ChangesJson).HasColumnType("TEXT");
            // FK 없이 plain int? + 인덱스 — Project 삭제 시 ActivityLog 는 감사 로그로 그대로 보존.
            e.HasIndex(x => new { x.ProjectId, x.Timestamp });
            // prune 쿼리(전체 across)에서 Timestamp 단독 필터에도 인덱스 사용 가능하게.
            e.HasIndex(x => x.Timestamp);
        });

        modelBuilder.Entity<TodoItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(300);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            // 신규 enum 은 string 저장 (순서 변경 안전, SQL 가독성) — 기존 Meeting.Category/IssueWbsLink.Type 관례.
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16).HasDefaultValue(TodoStatus.Open);
            e.Property(x => x.Recurrence).HasConversion<string>().HasMaxLength(16).HasDefaultValue(TodoRecurrence.None);
            // 담당자 리소스 삭제 시 TODO 본체는 보존하고 담당자만 비운다.
            e.HasOne(x => x.AssigneeResource).WithMany().HasForeignKey(x => x.AssigneeResourceId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.DueDate);
            e.HasIndex(x => x.AssigneeResourceId);
        });
    }

    public override int SaveChanges()
    {
        ApplyAudit();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyAudit();
        return base.SaveChangesAsync(cancellationToken);
    }

    // actor 가 빈 문자열이어도 그대로 저장 = 헤더 누락된 시스템·스크립트 액션의 의미적 마커.
    private void ApplyAudit()
    {
        var actor = actorAccessor?.GetActor() ?? string.Empty;
        if (actor.Length > 200) actor = actor[..200];

        foreach (var entry in ChangeTracker.Entries().Where(e => e.Entity is IAuditable))
        {
            var auditable = (IAuditable)entry.Entity;
            if (entry.State == EntityState.Added)
            {
                if (string.IsNullOrEmpty(auditable.CreatedBy)) auditable.CreatedBy = actor;
                auditable.UpdatedBy = actor;
            }
            else if (entry.State == EntityState.Modified)
            {
                auditable.UpdatedBy = actor;
                // 클라가 실수로 CreatedBy 를 함께 PUT 해도 보존.
                entry.Property(nameof(IAuditable.CreatedBy)).IsModified = false;
            }
        }
    }
}
