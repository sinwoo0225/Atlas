using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProjectManager.AppHost.Composition;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.Persistence;

// stdio 가 MCP 통신 통로 — stdout 오염 절대 금지 (Logging.ClearProviders + Console UTF-8).
Console.InputEncoding = Encoding.UTF8;
Console.OutputEncoding = Encoding.UTF8;

// 데이터 폴더는 BootstrapConfig 가 자동 해석 (%LOCALAPPDATA%\Atlas\config.json 의 dataFolder
// 또는 기본 %USERPROFILE%\Documents\ProjectManager). Atlas.exe / Atlas-Cli.exe 와 같은 위치 공유.
var bootstrap = BootstrapConfig.Load();
var pathResolver = new PathResolver(bootstrap.ResolveDataFolder());

var builder = Host.CreateApplicationBuilder(args);
builder.Logging.ClearProviders();

// actor: env ATLAS_MCP_ACTOR > ATLAS_CLI_ACTOR > 기본 "claude-code-mcp".
// CLI 의 "claude-code" 와 구분되어 활동 페이지 필터에서 진입로 분리 가능.
var actor = Environment.GetEnvironmentVariable("ATLAS_MCP_ACTOR")
            ?? Environment.GetEnvironmentVariable("ATLAS_CLI_ACTOR");
if (string.IsNullOrWhiteSpace(actor)) actor = "claude-code-mcp";
builder.Services.AddSingleton<IActorAccessor>(new FixedActorAccessor(actor));

// MCP 서버는 long-lived — ActivityLogCleanupService 활성화 (24h 주기 prune).
builder.Services.AddAtlasServices(pathResolver, bootstrap, includeHostedServices: true);

builder.Services
    .AddMcpServer()
    .WithStdioServerTransport()
    .WithToolsFromAssembly();

using var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    // WAL 보장 — Atlas.exe / Atlas-Cli.exe 와 같은 DB 동시 안전.
    db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
}
await app.RunAsync();
