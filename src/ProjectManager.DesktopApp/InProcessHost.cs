using System.Net.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using ProjectManager.AppHost;

namespace ProjectManager.DesktopApp;

internal sealed class InProcessHost : IAsyncDisposable
{
    private WebApplication? _app;
    public HttpClient Client { get; private set; } = null!;

    public async Task StartAsync()
    {
        Environment.SetEnvironmentVariable(AppHostFactory.InProcessEnvVar, "1");

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(AppHostFactory).Assembly.GetName().Name,
            ContentRootPath = AppContext.BaseDirectory,
        });
        builder.WebHost.UseTestServer();

        _app = AppHostFactory.Build(builder);
        await _app.StartAsync();

        Client = _app.GetTestServer().CreateClient();
        Client.BaseAddress = new Uri("http://localhost/");
        Client.Timeout = Timeout.InfiniteTimeSpan;
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null)
        {
            try { await _app.StopAsync(); } catch { }
            await _app.DisposeAsync();
            _app = null;
        }
    }
}
