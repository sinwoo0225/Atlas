namespace ProjectManager.Infrastructure.Config;

public class PathResolver
{
    private readonly string _basePath;

    public PathResolver(string? basePath = null)
    {
        _basePath = basePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "ProjectManager");
        Directory.CreateDirectory(_basePath);
    }

    public string GetProjectFolder(string projectName)
    {
        var safe = string.Concat((projectName ?? string.Empty).Split(Path.GetInvalidFileNameChars())).Trim();
        if (string.IsNullOrWhiteSpace(safe)) safe = "Project";
        var folder = Path.Combine(_basePath, safe);
        Directory.CreateDirectory(folder);
        return folder;
    }

    public string GetDevFilesFolder(string projectFolder)
    {
        var folder = Path.Combine(projectFolder, "DevFiles");
        Directory.CreateDirectory(folder);
        return folder;
    }

    public string GetMeetingsFolder(string projectFolder)
    {
        var folder = Path.Combine(projectFolder, "Meetings");
        Directory.CreateDirectory(folder);
        return folder;
    }

    public string GetDevInfoFolder(string projectFolder)
    {
        var folder = Path.Combine(projectFolder, "DevInfo");
        Directory.CreateDirectory(folder);
        return folder;
    }

    public string GetDatabasePath() => Path.Combine(_basePath, "projectmanager.db");
}
