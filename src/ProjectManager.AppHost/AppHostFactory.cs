using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using ProjectManager.Application.Search;
using ProjectManager.AppHost.Composition;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.AppHost;

public static class AppHostFactory
{
    public const string InProcessEnvVar = "ATLAS_INPROC";
    public const string ServerEnvVar = "ATLAS_SERVER";
    public const string ApiKeyEnvVar = "ATLAS_API_KEY";

    // dev(Kestrel) 에서 /api 가 아닌 경로로 들어왔을 때의 안내. 이 프로세스는 API 전용이다.
    // 여기서 SPA 를 서빙하지 않는 이유는 아래 MapFallback 주석 참고.
    private const string DevUiNoticeHtml = """
        <!doctype html><meta charset="utf-8"><title>Atlas — API 전용 (dev)</title>
        <style>
          body{font:15px/1.7 system-ui,'Segoe UI',sans-serif;background:#0f172a;color:#cbd5e1;
               display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
          .box{max-width:44rem;padding:2rem 2.5rem;background:#1e293b;border-radius:12px;border:1px solid #334155}
          h1{margin:0 0 .5rem;font-size:1.25rem;color:#f1f5f9}
          a{color:#7c8db5} code{background:#0f172a;padding:.1rem .4rem;border-radius:4px;color:#c6b590}
          ul{padding-left:1.2rem} li{margin:.4rem 0}
        </style>
        <div class="box">
          <h1>이 포트(:5200)는 API 전용입니다</h1>
          <p>dev 백엔드는 <code>/api/*</code> 만 담당합니다. 화면은 여기서 서빙하지 않습니다.</p>
          <ul>
            <li><b>UI 를 보려면</b> → <a href="http://localhost:5173">http://localhost:5173</a> (Vite dev — 라이브 소스, <code>/api</code> 는 이 포트로 프록시)</li>
            <li>둘 다 한 번에 → 레포 루트에서 <code>./start.ps1</code></li>
            <li>실제 배포본 확인 → <code>./publish.ps1 -SkipZip</code> 후 <code>publish/Atlas.exe</code></li>
          </ul>
          <p style="color:#64748b;font-size:.9em;margin-bottom:0">
            예전엔 이 포트가 <code>src/ProjectManager.WebService/wwwroot/</code> 를 서빙했지만, 그 폴더를 갱신하는
            빌드 단계가 없어 낡은 번들이 그대로 나가는 함정이었습니다. 조용히 옛 화면을 보여주느니 이렇게 안내합니다.
          </p>
        </div>
        """;

    public static WebApplication Build(WebApplicationBuilder builder)
    {
        builder.Services.AddControllers()
            .AddApplicationPart(typeof(AppHostFactory).Assembly)
            .AddJsonOptions(opt =>
                opt.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

        builder.Services.Configure<FormOptions>(o =>
        {
            o.MultipartBodyLengthLimit = long.MaxValue;
            o.ValueLengthLimit = int.MaxValue;
            o.MultipartHeadersLengthLimit = int.MaxValue;
        });

        var bootstrap = BootstrapConfig.Load();
        var pathResolver = new PathResolver(bootstrap.ResolveDataFolder());

        // X-Atlas-Actor 헤더 (작성자 자동 추적) 를 AppDbContext.SaveChanges 가 읽을 수 있게 등록.
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<IActorAccessor, HttpActorAccessor>();
        // X-Atlas-WorkLog-Scope 헤더('mine'|'all') — 업무일지 자동 등록 범위(설정 '자신만') 게이팅.
        builder.Services.AddScoped<IWorkLogScopeAccessor, HttpWorkLogScopeAccessor>();

        // DbContext + repository + service 그래프는 CLI/MCP 와 공유되는 헬퍼로 일원화.
        builder.Services.AddAtlasServices(pathResolver, bootstrap, includeHostedServices: true);

        builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
            p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

        var app = builder.Build();

        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.Migrate();
            // WAL 전환 — Atlas.exe 가 켜진 상태에서 CLI/외부 프로세스가 같은 DB 에 쓸 때 lock 경합 회피.
            // idempotent — 이미 WAL 이면 no-op. 기존 .db 는 첫 연결에 .db-wal / .db-shm 동반 생성.
            db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");

            // 사이클 14 — WbsItem.SortOrder 1회 backfill (Order→Importance rename 직후).
            // 멱등 가드: 모든 SortOrder 가 0 일 때만 (사용자가 dnd-kit 으로 한 번이라도 reorder 했으면 skip).
            // raw SQL 이라 UpdatedAt/UpdatedBy 안 건드림 → 사이클 12 동시성 토큰 + ActivityLog 노이즈 모두 회피.
            var allSortOrder = db.WbsItems.AsNoTracking().Select(x => x.SortOrder).ToList();
            if (allSortOrder.Count > 0 && allSortOrder.All(v => v == 0))
            {
                db.Database.ExecuteSqlRaw(@"
                    WITH ranked AS (
                      SELECT Id, ROW_NUMBER() OVER (
                        PARTITION BY ProjectId, COALESCE(ParentId, -1)
                        ORDER BY COALESCE(StartDate, '9999-12-31'), Id
                      ) - 1 AS rn
                      FROM WbsItems
                    )
                    UPDATE WbsItems SET SortOrder = (SELECT rn FROM ranked WHERE ranked.Id = WbsItems.Id);
                ");
                Console.WriteLine($"[wbs-sortorder] backfilled {allSortOrder.Count} rows.");
            }

            // Issue.SequenceNumber 1회 backfill — 프로젝트별 1-기반, 생성 시점(CreatedAt) 순.
            // 멱등 가드: SequenceNumber=0(미부여) 행이 있을 때만. 신규 이슈는 repo 에서 max+1 부여되어 항상 >0.
            // raw SQL — UpdatedAt/UpdatedBy·ActivityLog 안 건드림. 이미 번호가 있는 행이 있으면 그 max 뒤로 이어붙임.
            var zeroSeqCount = db.Issues.AsNoTracking().Count(x => x.SequenceNumber == 0);
            if (zeroSeqCount > 0)
            {
                db.Database.ExecuteSqlRaw(@"
                    WITH ranked AS (
                      SELECT Id, ProjectId, ROW_NUMBER() OVER (
                        PARTITION BY ProjectId ORDER BY CreatedAt, Id
                      ) AS rn
                      FROM Issues WHERE SequenceNumber = 0
                    )
                    UPDATE Issues SET SequenceNumber = (
                      SELECT r.rn + COALESCE(
                        (SELECT MAX(i2.SequenceNumber) FROM Issues i2
                         WHERE i2.ProjectId = Issues.ProjectId AND i2.SequenceNumber > 0), 0)
                      FROM ranked r WHERE r.Id = Issues.Id)
                    WHERE SequenceNumber = 0;
                ");
                Console.WriteLine($"[issue-seq] backfilled {zeroSeqCount} rows.");
            }

            // 기존 Project.GitRepoPath(프로젝트당 1개) → GitRepo 타입 업무 정보로 1회 이관.
            // git 이력이 업무 정보(DevInfo)로 이전됨에 따라, 이미 경로를 설정해 둔 프로젝트의 저장소를
            // 업무 정보 항목 1건으로 자동 등록한다. Project.GitRepoPath 컬럼은 보존(롤백 안전·시드 소스), UI 만 비노출.
            // 멱등 가드: 해당 프로젝트에 GitRepo 항목이 아직 없을 때만. DbContext 경유라 audit·검색 인덱스 정상 기록.
            var gitProjects = db.Projects.AsNoTracking()
                .Where(p => p.GitRepoPath != "")
                .Select(p => new { p.Id, p.GitRepoPath })
                .ToList();
            if (gitProjects.Count > 0)
            {
                var seeded = db.DevInfoItems.AsNoTracking()
                    .Where(d => d.Type == DevInfoType.GitRepo)
                    .Select(d => d.ProjectId)
                    .ToHashSet();
                var toAdd = new List<DevInfoItem>();
                foreach (var p in gitProjects)
                {
                    if (seeded.Contains(p.Id)) continue;
                    var name = Path.GetFileName(p.GitRepoPath.TrimEnd('\\', '/'));
                    if (string.IsNullOrWhiteSpace(name)) name = "git";
                    toAdd.Add(new DevInfoItem
                    {
                        ProjectId = p.Id,
                        Title = name,
                        Type = DevInfoType.GitRepo,
                        StorageMode = DevInfoStorageMode.Reference,
                        FilePath = p.GitRepoPath,
                    });
                }
                if (toAdd.Count > 0)
                {
                    db.DevInfoItems.AddRange(toAdd);
                    db.SaveChanges();
                    Console.WriteLine($"[git-devinfo] migrated {toAdd.Count} project git repos to work-info.");
                }
            }
        }

        // ActivityLog 보존은 ActivityLogCleanupService (BackgroundService) 가 시작 즉시 1회 + 주기 실행. AddHostedService 위 등록.

        // 검색 인덱스 (FTS5) 가 비어 있으면 백그라운드로 한 번 빌드.
        // 신규 설치/마이그레이션 직후 또는 데이터 폴더 교체 직후에 자동 복구.
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = app.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var search = scope.ServiceProvider.GetRequiredService<SearchService>();
                var hasAny = await db.Projects.AsNoTracking().AnyAsync();
                var indexed = await search.CountAsync(db);
                if (hasAny && indexed == 0)
                {
                    var built = await search.RebuildAllAsync(db);
                    Console.WriteLine($"[search-index] auto-rebuilt {built} rows.");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[search-index] auto-rebuild failed: " + ex.Message);
            }
        });

        var inProcess = Environment.GetEnvironmentVariable(InProcessEnvVar) == "1";
        var serverMode = Environment.GetEnvironmentVariable(ServerEnvVar) == "1";

        // 정적파일은 세 경우 모두 여기서 서빙하지 않는다:
        //  - 인프로세스 (DesktopApp 의 WebViewServer 가 exe 옆 wwwroot 를 직접 서빙)
        //  - 서버 모드 (옵션 A: 클라이언트 측 wwwroot 사용, 서버는 API 만)
        //  - dev (Kestrel) — UI 는 Vite dev 서버(:5173)가 라이브 소스로 서빙하고 /api 만 여기로 프록시한다
        //
        // dev 에서 SPA 를 여기서 서빙하지 '않는' 이유: `npm run build` 는 frontend/dist/ 로만 뱉고
        // publish 의 PublishFrontend 는 그걸 publish/wwwroot/ 로 복사한다. 즉 이 프로젝트의 wwwroot/ 를
        // 갱신하는 주체가 아무도 없어서, 한번 파일이 들어오면 그대로 화석이 된다.
        // 실제로 사이클 172 에서 두 달 묵은 번들이 서빙되는 바람에 "UI 변경이 반영 안 됐다"고 오판할 뻔했다.
        // 조용히 옛 화면을 보여주느니 대놓고 안내하는 편이 낫다.
        if (!inProcess && !serverMode)
            app.MapFallback(() => Results.Content(DevUiNoticeHtml, "text/html; charset=utf-8"));

        app.UseCors();

        // 동시 편집 충돌 → 409 Conflict 일관 응답. 서비스/컨트롤러마다 try/catch 안 박아도 됨.
        app.Use(async (ctx, next) =>
        {
            try { await next(); }
            catch (DbUpdateConcurrencyException)
            {
                ctx.Response.StatusCode = StatusCodes.Status409Conflict;
                ctx.Response.ContentType = "application/json";
                await ctx.Response.WriteAsync(
                    "{\"error\":\"이 항목이 다른 사용자에 의해 방금 수정되었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.\"}");
            }
        });

        // 서버 모드: ATLAS_API_KEY env 가 있으면 모든 /api 요청에 X-Atlas-Key 헤더 검증.
        // env 가 비어 있으면 미들웨어 자체를 등록하지 않아 인증 없는 사내망 시나리오도 가능.
        if (serverMode)
        {
            var expectedKey = Environment.GetEnvironmentVariable(ApiKeyEnvVar);
            if (!string.IsNullOrEmpty(expectedKey))
            {
                app.Use(async (ctx, next) =>
                {
                    // /api/system/ping 도 인증을 요구한다 — 클라이언트가 키 정합성을 확인할 수 있어야 함.
                    if (ctx.Request.Path.StartsWithSegments("/api"))
                    {
                        var got = ctx.Request.Headers["X-Atlas-Key"].ToString();
                        if (!string.Equals(got, expectedKey, StringComparison.Ordinal))
                        {
                            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                            await ctx.Response.WriteAsync("Invalid or missing X-Atlas-Key.");
                            return;
                        }
                    }
                    await next();
                });
            }
        }

        app.MapControllers();
        return app;
    }
}
