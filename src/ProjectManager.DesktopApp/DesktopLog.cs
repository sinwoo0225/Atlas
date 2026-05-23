using System.IO;

namespace ProjectManager.DesktopApp;

// %LOCALAPPDATA%\Atlas\atlas-debug.log 에 한 줄씩 append. 실패는 무시(로깅이 앱을 죽이면 안 됨).
internal static class DesktopLog
{
    public static void Write(string line)
    {
        try
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dir = Path.Combine(local, "Atlas");
            Directory.CreateDirectory(dir);
            File.AppendAllText(Path.Combine(dir, "atlas-debug.log"), $"[{DateTime.Now:HH:mm:ss.fff}] {line}\n");
        }
        catch { }
    }
}
