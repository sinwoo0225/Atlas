using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using ProjectManager.Application.Services;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.FileStorage;
using ProjectManager.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(opt =>
        opt.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var pathResolver = new PathResolver();
builder.Services.AddSingleton(pathResolver);
builder.Services.AddSingleton<DevFilesStorage>();

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite($"Data Source={pathResolver.GetDatabasePath()}"));

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
    await db.Database.MigrateAsync();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors();
app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
