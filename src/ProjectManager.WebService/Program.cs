using ProjectManager.AppHost;

var app = AppHostFactory.Build(WebApplication.CreateBuilder(args));
app.Run();
