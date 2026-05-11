using ProjectManager.Infrastructure.Config;

namespace ProjectManager.Infrastructure.FileStorage;

public class DevFilesStorage(PathResolver pathResolver)
{
    public async Task<string> SaveFileAsync(string projectFolder, string originalFileName, Stream content)
    {
        var devFilesFolder = pathResolver.GetDevFilesFolder(projectFolder);
        var fileName = $"{Guid.NewGuid()}_{Path.GetFileName(originalFileName)}";
        var filePath = Path.Combine(devFilesFolder, fileName);
        using var fs = File.Create(filePath);
        await content.CopyToAsync(fs);
        return filePath;
    }

    public void OpenFile(string filePath)
    {
        if (!File.Exists(filePath))
            throw new FileNotFoundException("File not found", filePath);
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = filePath,
            UseShellExecute = true
        });
    }

    public void DeleteFile(string filePath)
    {
        if (File.Exists(filePath))
            File.Delete(filePath);
    }
}
