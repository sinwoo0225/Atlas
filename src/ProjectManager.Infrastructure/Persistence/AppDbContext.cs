using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;

namespace ProjectManager.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<WbsItem> WbsItems => Set<WbsItem>();
    public DbSet<WbsVersion> WbsVersions => Set<WbsVersion>();
    public DbSet<ChangeLog> ChangeLogs => Set<ChangeLog>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<DevInfoItem> DevInfoItems => Set<DevInfoItem>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<Issue> Issues => Set<Issue>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Project>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
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
            e.HasOne(x => x.Parent).WithMany(x => x.Children).HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Version).WithMany(x => x.WbsItems).HasForeignKey(x => x.VersionId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ChangeLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Content).IsRequired();
        });

        modelBuilder.Entity<Meeting>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Topic).IsRequired().HasMaxLength(300);
        });

        modelBuilder.Entity<DevInfoItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(300);
        });

        modelBuilder.Entity<Resource>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
        });

        modelBuilder.Entity<Issue>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(300);
            e.HasOne(x => x.Project).WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.AssigneeResource).WithMany().HasForeignKey(x => x.AssigneeResourceId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.ProjectId);
            e.HasIndex(x => x.AssigneeResourceId);
        });
    }
}
