using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.AppHost.Services;

// 자동 백업 정기 실행기. ActivityLogCleanupService 패턴.
// - 설정은 config.json(BootstrapConfig) 에서 매 틱 재로드 → 재시작 없이 변경 반영.
// - "켤 때 + 주기": 시작 즉시 1회 평가, 이후 BackupIntervalHours 마다.
// - staleness 는 대상 폴더의 최신 백업 zip mtime 으로 판단 → 재시작에도 상태파일 없이 동작
//   (백업이 잦은 재실행마다 중복 생성되지 않음).
// - includeHostedServices(웹/데스크톱·서버) 에서만 등록. CLI/Client 데스크톱(in-process 미기동)은 미동작.
public class AutoBackupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AutoBackupService> _logger;
    private bool _ranThisLaunch;

    public AutoBackupService(IServiceScopeFactory scopeFactory, ILogger<AutoBackupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // 매 틱 재로드 — 사용자가 설정을 바꾸면 재시작 없이 다음 틱부터 반영.
            var cfg = BootstrapConfig.Load();
            var intervalHours = cfg.BackupIntervalHours <= 0 ? 24 : cfg.BackupIntervalHours;
            var delay = TimeSpan.FromHours(Math.Max(1, intervalHours));

            try
            {
                if (cfg.AutoBackupEnabled
                    && !string.IsNullOrWhiteSpace(cfg.BackupFolder)
                    && IsDue(cfg.BackupFolder!, cfg.BackupIntervalHours))
                {
                    using var scope = _scopeFactory.CreateScope();
                    var svc = scope.ServiceProvider.GetRequiredService<BackupService>();
                    var result = await svc.CreateFullBackupAsync(
                        cfg.BackupFolder!, cfg.BackupIncludeFiles, cfg.BackupRetention, stoppingToken);
                    _ranThisLaunch = true;
                    _logger.LogInformation(
                        "[auto-backup] {File} ({KB} KB) → {Folder}",
                        result.FileName, result.SizeBytes / 1024, cfg.BackupFolder);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception e)
            {
                _logger.LogWarning(e, "[auto-backup] tick failed");
            }

            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    // 백업이 필요한가? interval<=0 → 프로세스당 1회. 아니면 최신 백업이 interval 보다 오래됐을 때.
    private bool IsDue(string folder, int intervalHours)
    {
        if (intervalHours <= 0) return !_ranThisLaunch;

        DateTime? last;
        try
        {
            if (!Directory.Exists(folder)) return true;
            var newest = Directory.EnumerateFiles(folder, $"{BackupService.Prefix}*.zip")
                .Where(f => BackupService.IsBackupZip(Path.GetFileName(f)))
                .Select(f => (DateTime?)new FileInfo(f).LastWriteTimeUtc)
                .DefaultIfEmpty(null)
                .Max();
            last = newest;
        }
        catch
        {
            return true; // 폴더 스캔 실패해도 백업 시도 (실패 시 상위 catch 가 로그).
        }

        if (last is null) return true;
        return DateTime.UtcNow - last.Value >= TimeSpan.FromHours(intervalHours);
    }
}
