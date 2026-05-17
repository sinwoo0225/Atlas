using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProjectManager.Application.Services;

namespace ProjectManager.AppHost.Services;

// ActivityLog 보존 정책의 정기 실행기. 기존 startup 시 1회 호출 (AppHostFactory) 을 대체.
// 시작 즉시 1회 prune 후 CleanupIntervalHours 주기로 반복. 실패는 로그만 — 앱 자체엔 영향 없음.
//
// 설정 (appsettings.json):
//   "ActivityLog": { "RetentionDays": 180, "CleanupIntervalHours": 24 }
// 환경변수 override: ActivityLog__RetentionDays / ActivityLog__CleanupIntervalHours
//
// AppHost 프로젝트에 둠 — Application 레이어는 hosting 의존성을 갖지 않게 유지.
public class ActivityLogCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ActivityLogCleanupService> _logger;
    private readonly TimeSpan _interval;
    private readonly TimeSpan _retention;

    public ActivityLogCleanupService(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<ActivityLogCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;

        var hours = config.GetValue("ActivityLog:CleanupIntervalHours", 24);
        // 최소 1시간 — 설정 실수로 너무 잦게 도는 것 방어.
        _interval = TimeSpan.FromHours(Math.Max(1, hours));

        var days = config.GetValue("ActivityLog:RetentionDays", 180);
        _retention = TimeSpan.FromDays(Math.Max(1, days));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<ActivityLogService>();
                var removed = await svc.PruneAsync(_retention);
                if (removed > 0)
                    _logger.LogInformation("[activity-log] pruned {Removed} rows older than {Days}d", removed, _retention.TotalDays);
            }
            catch (Exception e)
            {
                _logger.LogWarning(e, "[activity-log] cleanup tick failed");
            }

            try
            {
                await Task.Delay(_interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
