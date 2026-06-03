using System.Runtime.InteropServices;
using System.Text;

namespace ProjectManager.AppHost.Services;

// 현재 프로세스가 MSIX 패키지(Microsoft Store 빌드)로 실행 중인지 판별.
// 용도: 스토어 빌드에서는 인앱 업데이터(Setup.exe 다운로드·실행)를 비활성화해야 한다 —
// 업데이트는 Store 가 관리하고, 패키지는 읽기전용 설치라 Setup.exe 교체가 동작하지 않으며,
// Setup.exe 다운로드·실행은 스토어 정책에도 어긋난다.
// 판별: Win32 GetCurrentPackageFullName 은 비패키지 프로세스에서 APPMODEL_ERROR_NO_PACKAGE(15700) 를
// 반환한다. 그 외(ERROR_INSUFFICIENT_BUFFER 등)면 패키지 컨텍스트.
public static class AppPackaging
{
    private const int AppModelErrorNoPackage = 15700;

    // 프로세스 수명 동안 불변 — 1회 계산 후 캐시.
    public static bool IsPackaged { get; } = DetectPackaged();

    private static bool DetectPackaged()
    {
        try
        {
            int length = 0;
            int rc = GetCurrentPackageFullName(ref length, null);
            return rc != AppModelErrorNoPackage;
        }
        catch (EntryPointNotFoundException)
        {
            // 패키지 API 자체가 없는 구형 OS → 비패키지로 간주.
            return false;
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = false)]
    private static extern int GetCurrentPackageFullName(ref int packageFullNameLength, StringBuilder? packageFullName);
}
