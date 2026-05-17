using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using ProjectManager.Application.Search;
using ProjectManager.AppHost.Composition;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.AppHost;

public static class AppHostFactory
{
    public const string InProcessEnvVar = "ATLAS_INPROC";
    public const string ServerEnvVar = "ATLAS_SERVER";
    public const string ApiKeyEnvVar = "ATLAS_API_KEY";

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

        // 정적파일은 두 경우에 skip:
        //  - 인프로세스 (DesktopApp 가 wwwroot 를 직접 서빙)
        //  - 서버 모드 (옵션 A: 클라이언트 측 wwwroot 사용, 서버는 API 만)
        if (!inProcess && !serverMode)
        {
            app.UseDefaultFiles();
            app.UseStaticFiles();
            app.MapFallbackToFile("index.html");
        }

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
