using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.AppHost.Services;

// 자동 업데이트 정기 체크. AutoBackupService 패턴.
// - 설정은 config.json(BootstrapConfig) 에서 매 틱 재로드 → 재시작 없이 변경 반영.
// - 시작 즉시 1회 평가, 이후 UpdateCheckIntervalHours 마다. UpdateLastCheckedAt 로 due 판정
//   → 재시작에도 (잦은 재실행마다) 중복 조회하지 않음.
// - 다운로드는 하지 않음 — 발견만 하고 결과를 UpdateService 상태/ config 에 남긴다(프론트가 토스트).
// - includeHostedServices(웹/데스크톱·서버) 에서만 등록. CLI/Client 데스크톱은 미동작.
public class UpdateCheckService : BackgroundService
{
    private readonly UpdateService _updates;
    private readonly ILogger<UpdateCheckService> _logger;

    public UpdateCheckService(UpdateService updates, ILogger<UpdateCheckService> logger)
    {
        _updates = updates;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Microsoft Store(MSIX) 빌드는 업데이트를 스토어가 관리 — 백그라운드 체크 자체를 돌리지 않는다.
        if (AppPackaging.IsPackaged) return;

        // 시작 직후 폭주 방지 — 앱 부팅 직후 잠깐 지연.
        try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            var cfg = BootstrapConfig.Load();
            var intervalHours = cfg.UpdateCheckIntervalHours < 1 ? 24 : cfg.UpdateCheckIntervalHours;
            var delay = TimeSpan.FromHours(intervalHours);

            try
            {
                if (cfg.UpdateCheckEnabled && IsDue(cfg.UpdateLastCheckedAt, intervalHours))
                {
                    var r = await _updates.CheckAsync(stoppingToken);
                    if (r.HasUpdate)
                        _logger.LogInformation("[update] new version available: {Latest}", r.LatestVersion);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception e)
            {
                _logger.LogWarning(e, "[update] check tick failed");
            }

            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static bool IsDue(DateTime? lastCheckedAt, int intervalHours)
    {
        if (lastCheckedAt is null) return true;
        return DateTime.UtcNow - lastCheckedAt.Value >= TimeSpan.FromHours(intervalHours);
    }
}
