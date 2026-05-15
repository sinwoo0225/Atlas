using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Search;
using ProjectManager.Application.Services;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.FileStorage;
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
        builder.Services.AddSingleton(bootstrap);
        builder.Services.AddSingleton(pathResolver);
        builder.Services.AddSingleton<DevFilesStorage>();
        builder.Services.AddSingleton<MeetingMarkdownExporter>();

        // Default Timeout=30 — 동시 라이터 충돌 시 즉시 'database is locked' 가 아니라 최대 30초 busy wait.
        // 사용자 입력 수준의 동시성(드물게 겹치는 PUT/POST)은 이 한 줄로 거의 다 흡수된다.
        builder.Services.AddScoped<SearchService>();
        builder.Services.AddScoped<SearchSaveChangesInterceptor>();
        builder.Services.AddDbContext<AppDbContext>((sp, opt) =>
            opt
                .UseSqlite($"Data Source={pathResolver.GetDatabasePath()};Default Timeout=30")
                .AddInterceptors(sp.GetRequiredService<SearchSaveChangesInterceptor>()));

        builder.Services.AddScoped<IProjectRepository, ProjectRepository>();
        builder.Services.AddScoped<IWbsRepository, WbsRepository>();
        builder.Services.AddScoped<IChangeLogRepository, ChangeLogRepository>();
        builder.Services.AddScoped<IMeetingRepository, MeetingRepository>();
        builder.Services.AddScoped<IDevInfoRepository, DevInfoRepository>();
        builder.Services.AddScoped<IResourceRepository, ResourceRepository>();
        builder.Services.AddScoped<IIssueRepository, IssueRepository>();
        builder.Services.AddScoped<IWorkLogRepository, WorkLogRepository>();

        builder.Services.AddScoped<ProjectService>();
        builder.Services.AddScoped<WbsService>();
        builder.Services.AddScoped<ChangeLogService>();
        builder.Services.AddScoped<MeetingService>();
        builder.Services.AddScoped<DevInfoService>();
        builder.Services.AddScoped<ResourceService>();
        builder.Services.AddScoped<IssueService>();
        builder.Services.AddScoped<WorkLogService>();
        builder.Services.AddScoped<MonitoringService>();

        builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
            p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

        var app = builder.Build();

        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.Migrate();
        }

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
