using System.CommandLine;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProjectManager.AppHost.Composition;
using ProjectManager.Cli.Commands;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.Persistence;

// 한글 입출력 안정화 — PowerShell 5.1 의 기본 인코딩 (cp949/ascii) 에서 한글이 깨지지 않도록
// stdin/stdout 둘 다 UTF-8. 호출자 측에서도 $OutputEncoding 을 UTF-8 로 두는 게 권장.
Console.InputEncoding = Encoding.UTF8;
Console.OutputEncoding = Encoding.UTF8;

// 데이터 폴더는 BootstrapConfig 가 자동 해석 (%LOCALAPPDATA%\Atlas\config.json 의 dataFolder
// 또는 기본 %USERPROFILE%\Documents\ProjectManager). Atlas.exe 와 같은 위치 공유.
var bootstrap = BootstrapConfig.Load();
var pathResolver = new PathResolver(bootstrap.ResolveDataFolder());

var builder = Host.CreateApplicationBuilder(args);
// CLI stdout 은 JSON 한 줄만 — EF/호스팅 정보 로그가 섞이면 ConvertFrom-Json 깨짐.
// 에러는 stderr JSON 으로 별도 출력하므로 콘솔 로그 provider 자체를 제거.
builder.Logging.ClearProviders();
// actor: env ATLAS_CLI_ACTOR > 기본 "claude-code". 활동 로그에 그대로 기록.
var actor = Environment.GetEnvironmentVariable("ATLAS_CLI_ACTOR");
if (string.IsNullOrWhiteSpace(actor)) actor = "claude-code";
builder.Services.AddSingleton<IActorAccessor>(new FixedActorAccessor(actor));
builder.Services.AddAtlasServices(pathResolver, bootstrap, includeHostedServices: false);

using var app = builder.Build();
using var scope = app.Services.CreateScope();
var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
db.Database.Migrate();
// WAL 보장 — Atlas.exe 가 먼저 켜져 있어도, CLI 가 먼저 호출돼도 둘 다 WAL 모드.
db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");

var root = CommandFactory.BuildRoot(scope.ServiceProvider);
return await root.InvokeAsync(args);
