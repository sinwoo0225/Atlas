using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.FileStorage;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.AppHost;

public static class AppHostFactory
{
    public const string InProcessEnvVar = "ATLAS_INPROC";

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
            db.Database.Migrate();
        }

        if (Environment.GetEnvironmentVariable(InProcessEnvVar) != "1")
        {
            app.UseDefaultFiles();
            app.UseStaticFiles();
            app.MapFallbackToFile("index.html");
        }

        app.UseCors();
        app.MapControllers();
        return app;
    }
}
