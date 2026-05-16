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
    public DbSet<ChangeLog> ChangeLogs => Set<ChangeLog>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<DevInfoItem> DevInfoItems => Set<DevInfoItem>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<Issue> Issues => Set<Issue>();
    public DbSet<WorkLog> WorkLogs => Set<WorkLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Project>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
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
            e.HasOne(x => x.Parent).WithMany(x => x.Children).HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Version).WithMany(x => x.WbsItems).HasForeignKey(x => x.VersionId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ChangeLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Content).IsRequired();
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
        });

        modelBuilder.Entity<Meeting>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Topic).IsRequired().HasMaxLength(300);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
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
        });

        modelBuilder.Entity<Issue>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(300);
            e.Property(x => x.UpdatedAt).IsConcurrencyToken();
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.HasOne(x => x.Project).WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.AssigneeResource).WithMany().HasForeignKey(x => x.AssigneeResourceId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.ProjectId);
            e.HasIndex(x => x.AssigneeResourceId);
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
