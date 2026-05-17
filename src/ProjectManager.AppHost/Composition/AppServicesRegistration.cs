using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Activity;
using ProjectManager.Application.Search;
using ProjectManager.Application.Services;
using ProjectManager.AppHost.Services;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.FileStorage;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.AppHost.Composition;

// AppHostFactory(웹/데스크톱) 와 ProjectManager.Cli(콘솔) 가 같은 DbContext + repo + service 그래프를
// 공유하기 위한 확장 메서드. IActorAccessor 는 호스트마다 다르므로 여기서 등록하지 않는다
// — 호출자가 HttpActorAccessor / FixedActorAccessor 등 적절한 구현을 직접 등록할 것.
public static class AppServicesRegistration
{
    public static IServiceCollection AddAtlasServices(
        this IServiceCollection services,
        PathResolver pathResolver,
        BootstrapConfig bootstrap,
        bool includeHostedServices = true)
    {
        services.AddSingleton(bootstrap);
        services.AddSingleton(pathResolver);
        services.AddSingleton<DevFilesStorage>();
        services.AddSingleton<MeetingMarkdownExporter>();

        // Default Timeout=30 — 동시 라이터 충돌 시 즉시 'database is locked' 가 아니라 최대 30초 busy wait.
        // 사용자 입력 수준의 동시성(드물게 겹치는 PUT/POST · CLI 호출)은 이 한 줄로 거의 다 흡수된다.
        services.AddScoped<SearchService>();
        services.AddScoped<SearchSaveChangesInterceptor>();
        services.AddScoped<ActivityLogInterceptor>();
        services.AddDbContext<AppDbContext>((sp, opt) =>
            opt
                .UseSqlite($"Data Source={pathResolver.GetDatabasePath()};Default Timeout=30")
                .AddInterceptors(
                    sp.GetRequiredService<SearchSaveChangesInterceptor>(),
                    sp.GetRequiredService<ActivityLogInterceptor>()));

        services.AddScoped<IProjectRepository, ProjectRepository>();
        services.AddScoped<IWbsRepository, WbsRepository>();
        services.AddScoped<IChangeLogRepository, ChangeLogRepository>();
        services.AddScoped<IMeetingRepository, MeetingRepository>();
        services.AddScoped<IDevInfoRepository, DevInfoRepository>();
        services.AddScoped<IResourceRepository, ResourceRepository>();
        services.AddScoped<IIssueRepository, IssueRepository>();
        services.AddScoped<IWorkLogRepository, WorkLogRepository>();
        services.AddScoped<IActivityLogRepository, ActivityLogRepository>();
        services.AddScoped<IIssueWbsLinkRepository, IssueWbsLinkRepository>();

        services.AddScoped<ProjectService>();
        services.AddScoped<WbsService>();
        services.AddScoped<ChangeLogService>();
        services.AddScoped<MeetingService>();
        services.AddScoped<DevInfoService>();
        services.AddScoped<ResourceService>();
        services.AddScoped<IssueService>();
        services.AddScoped<WorkLogService>();
        services.AddScoped<ActivityLogService>();
        services.AddScoped<MonitoringService>();
        services.AddScoped<ActionItemPromotionService>();
        services.AddScoped<IssueWbsLinkService>();
        services.AddScoped<StartPageService>();

        // 보존 정책 정기 타이머는 장기 실행 호스트(웹/데스크톱) 에서만 — CLI/원샷에서는 불필요.
        if (includeHostedServices)
            services.AddHostedService<ActivityLogCleanupService>();

        return services;
    }
}
